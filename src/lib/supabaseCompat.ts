/**
 * PostgreSQL-backed compatibility layer that provides a Supabase-like query builder
 * interface. All queries are executed via the Express API server using the backend
 * pg pool.  Authentication tokens are attached automatically.
 */

import { query as dbQuery } from './database';
import { createClient } from '@supabase/supabase-js';

export interface QueryBuilder {
  select(columns?: string): QueryBuilder;
  insert(data: any): QueryBuilder;
  upsert(data: any, options?: { onConflict?: string }): QueryBuilder;
  update(data: any): QueryBuilder;
  delete(): QueryBuilder;
  eq(column: string, value: any): QueryBuilder;
  neq(column: string, value: any): QueryBuilder;
  gt(column: string, value: any): QueryBuilder;
  gte(column: string, value: any): QueryBuilder;
  lt(column: string, value: any): QueryBuilder;
  lte(column: string, value: any): QueryBuilder;
  like(column: string, pattern: string): QueryBuilder;
  ilike(column: string, pattern: string): QueryBuilder;
  is(column: string, value: any): QueryBuilder;
  in(column: string, values: any[]): QueryBuilder;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder;
  limit(count: number): QueryBuilder;
  single(): Promise<{ data: any; error: any }>;
  then(callback: (result: { data: any[]; error: any }) => any): Promise<any>;
}

type Operation = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

interface WhereCondition {
  column: string;
  operator: string;
  value: any;
}

class PostgreSQLQueryBuilder implements QueryBuilder {
  private table: string;
  private selectColumns: string = '*';
  private whereConditions: WhereCondition[] = [];
  private orderByColumn: string = '';
  private orderByAsc: boolean = true;
  private limitCount: number | null = null;
  private operation: Operation = 'select';
  private updateData: any = null;
  private insertData: any = null;
  private upsertData: any = null;
  private upsertConflict: string = '';
  private singleResult: boolean = false;

  constructor(table: string) {
    this.table = table;
  }

  select(columns: string = '*'): QueryBuilder {
    this.selectColumns = columns;
    if (this.operation !== 'insert' && this.operation !== 'update' && this.operation !== 'delete') {
      this.operation = 'select';
    }
    return this;
  }

  insert(data: any): QueryBuilder {
    this.operation = 'insert';
    this.insertData = data;
    return this;
  }

  upsert(data: any, options?: { onConflict?: string }): QueryBuilder {
    this.operation = 'upsert';
    this.upsertData = data;
    this.upsertConflict = options?.onConflict || '';
    return this;
  }

  update(data: any): QueryBuilder {
    this.operation = 'update';
    this.updateData = data;
    return this;
  }

  delete(): QueryBuilder {
    this.operation = 'delete';
    return this;
  }

  eq(column: string, value: any): QueryBuilder {
    this.whereConditions.push({ column, operator: '=', value });
    return this;
  }

  neq(column: string, value: any): QueryBuilder {
    this.whereConditions.push({ column, operator: '!=', value });
    return this;
  }

  gt(column: string, value: any): QueryBuilder {
    this.whereConditions.push({ column, operator: '>', value });
    return this;
  }

  gte(column: string, value: any): QueryBuilder {
    this.whereConditions.push({ column, operator: '>=', value });
    return this;
  }

  lt(column: string, value: any): QueryBuilder {
    this.whereConditions.push({ column, operator: '<', value });
    return this;
  }

  lte(column: string, value: any): QueryBuilder {
    this.whereConditions.push({ column, operator: '<=', value });
    return this;
  }

  like(column: string, pattern: string): QueryBuilder {
    this.whereConditions.push({ column, operator: 'LIKE', value: pattern });
    return this;
  }

  ilike(column: string, pattern: string): QueryBuilder {
    this.whereConditions.push({ column, operator: 'ILIKE', value: pattern });
    return this;
  }

  is(column: string, value: any): QueryBuilder {
    this.whereConditions.push({ column, operator: 'IS', value });
    return this;
  }

  in(column: string, values: any[]): QueryBuilder {
    this.whereConditions.push({ column, operator: 'IN', value: values });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): QueryBuilder {
    this.orderByColumn = column;
    this.orderByAsc = options?.ascending !== false;
    return this;
  }

  limit(count: number): QueryBuilder {
    this.limitCount = count;
    return this;
  }

  single(): Promise<{ data: any; error: any }> {
    this.singleResult = true;
    return this.execute();
  }

  then(callback: (result: { data: any[]; error: any }) => any): Promise<any> {
    return this.execute().then(callback);
  }

  // -----------------------------------------------------------------------
  // SQL builder
  // -----------------------------------------------------------------------

  /**
   * Parse a Supabase-style select expression that may contain embedded-join
   * notation like `*, customer:customers(*), driver:drivers(*)` and convert it
   * into a plain SQL SELECT list + JOIN clauses.
   *
   * Convention:
   *  - `alias:table(*)` where the main table has an `alias_id` column
   *    → many-to-one → LEFT JOIN + row_to_json
   *  - `alias:table(*)` where the related table name starts with the
   *    singular of the main table name (one-to-many child table)
   *    → one-to-many → LEFT JOIN + json_agg (requires GROUP BY)
   */
  private parseSelectExpression(): {
    selectSQL: string;
    joinSQL: string;
    needsGroupBy: boolean;
  } {
    const joinPattern = /(\w+):(\w+)\(([^)]*)\)/g;
    let joinSQL = '';
    const extraSelects: string[] = [];
    let needsGroupBy = false;

    // Determine singular form of the main table name for FK detection.
    // This uses a simplified English singularization that covers the tables
    // present in this schema (ifta_trips → ifta_trip, etc.).
    // For tables with irregular plurals, add explicit handling as needed.
    const mainSingular = this.table.replace(/ies$/, 'y').replace(/s$/, '');

    const remainder = this.selectColumns.replace(joinPattern, (_match, alias, relTable) => {
      // Decide relationship direction
      const relTableStartsWithMain = relTable.startsWith(mainSingular);

      if (relTableStartsWithMain) {
        // One-to-many: e.g. ifta_trip_states for ifta_trips
        const fk = `${mainSingular}_id`;
        joinSQL += ` LEFT JOIN "${relTable}" AS "${alias}" ON "${alias}"."${fk}" = "${this.table}"."id"`;
        extraSelects.push(
          `COALESCE(json_agg(DISTINCT "${alias}") FILTER (WHERE "${alias}"."id" IS NOT NULL), '[]') AS "${alias}"`,
        );
        needsGroupBy = true;
      } else {
        // Many-to-one: e.g. customers, drivers
        joinSQL += ` LEFT JOIN "${relTable}" AS "${alias}" ON "${alias}"."id" = "${this.table}"."${alias}_id"`;
        extraSelects.push(`row_to_json("${alias}") AS "${alias}"`);
      }

      return ''; // remove the join spec from the column list
    });

    // Normalise remaining base columns
    const baseParts = remainder
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '');

    const baseSelect = baseParts.length === 0
      ? `"${this.table}".*`
      : baseParts.map((s) => (s === '*' ? `"${this.table}".*` : s)).join(', ');

    const selectSQL = [baseSelect, ...extraSelects].join(', ');
    return { selectSQL, joinSQL, needsGroupBy };
  }

  private buildSQL(): { text: string; params: any[] } {
    const params: any[] = [];
    let pi = 1; // param index

    const addParam = (val: any): string => {
      params.push(val);
      return `$${pi++}`;
    };

    const buildWhere = (): string => {
      if (!this.whereConditions.length) return '';
      const parts = this.whereConditions.map((c) => {
        if (c.operator === 'IS') {
          return c.value === null
            ? `"${c.column}" IS NULL`
            : `"${c.column}" IS NOT NULL`;
        }
        if (c.operator === 'IN') {
          const placeholders = (c.value as any[]).map((v) => addParam(v)).join(', ');
          return `"${c.column}" IN (${placeholders})`;
        }
        return `"${c.column}" ${c.operator} ${addParam(c.value)}`;
      });
      return ` WHERE ${parts.join(' AND ')}`;
    };

    if (this.operation === 'select') {
      const { selectSQL, joinSQL, needsGroupBy } = this.parseSelectExpression();
      let text = `SELECT ${selectSQL} FROM "${this.table}"${joinSQL}${buildWhere()}`;
      if (needsGroupBy) text += ` GROUP BY "${this.table}"."id"`;
      if (this.orderByColumn) {
        text += ` ORDER BY "${this.table}"."${this.orderByColumn}" ${this.orderByAsc ? 'ASC' : 'DESC'}`;
      }
      if (this.limitCount !== null) {
        text += ` LIMIT ${addParam(this.limitCount)}`;
      }
      return { text, params };
    }

    if (this.operation === 'insert') {
      const rows = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
      const columns = Object.keys(rows[0]);
      const valueSets = rows
        .map((row: any) => `(${columns.map((col) => addParam(row[col])).join(', ')})`)
        .join(', ');
      return {
        text: `INSERT INTO "${this.table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES ${valueSets} RETURNING *`,
        params,
      };
    }

    if (this.operation === 'upsert') {
      const rows = Array.isArray(this.upsertData) ? this.upsertData : [this.upsertData];
      const columns = Object.keys(rows[0]);
      const valueSets = rows
        .map((row: any) => `(${columns.map((col) => addParam(row[col])).join(', ')})`)
        .join(', ');
      const updateCols = columns.filter((c) => c !== this.upsertConflict);
      const updateSet = updateCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
      const conflictClause = this.upsertConflict
        ? `ON CONFLICT ("${this.upsertConflict}") DO UPDATE SET ${updateSet}`
        : 'ON CONFLICT DO NOTHING';
      return {
        text: `INSERT INTO "${this.table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES ${valueSets} ${conflictClause} RETURNING *`,
        params,
      };
    }

    if (this.operation === 'update') {
      const columns = Object.keys(this.updateData);
      const setClause = columns.map((c) => `"${c}" = ${addParam(this.updateData[c])}`).join(', ');
      return {
        text: `UPDATE "${this.table}" SET ${setClause}${buildWhere()} RETURNING *`,
        params,
      };
    }

    if (this.operation === 'delete') {
      return {
        text: `DELETE FROM "${this.table}"${buildWhere()} RETURNING *`,
        params,
      };
    }

    throw new Error(`Unknown operation: ${this.operation}`);
  }

  private async execute(): Promise<{ data: any; error: any }> {
    try {
      const { text, params } = this.buildSQL();
      const result = await dbQuery(text, params);

      if (this.singleResult) {
        return { data: result.rows[0] ?? null, error: null };
      }

      return { data: result.rows, error: null };
    } catch (error: any) {
      console.error('Query execution error:', error);
      return { data: null, error };
    }
  }
}

/** Create a Supabase-like query builder backed by the Express/pg API. */
export function from(table: string): QueryBuilder {
  return new PostgreSQLQueryBuilder(table);
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseDb =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

// Create a db object that mirrors the shape expected by existing components
export const db = supabaseDb || {
  from,
  // Real-time channel stubs (not implemented with pg)
  channel: (_name: string) => ({
    on: (_event: string, _schema: any, _callback: any) => ({
      subscribe: () => {},
    }),
    subscribe: () => {},
  }),
  removeChannel: (_channel: any) => {},
  // Edge functions not available; components should use direct REST endpoints
  functions: {
    invoke: async (_fn: string, _opts?: any) => ({
      data: null,
      error: new Error('Edge functions are not available in this deployment'),
    }),
  },
  // Storage stubs
  storage: {
    from: (_bucket: string) => ({
      upload: async () => ({ data: null, error: new Error('Storage not available') }),
      download: async () => ({ data: null, error: new Error('Storage not available') }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
    }),
  },
};

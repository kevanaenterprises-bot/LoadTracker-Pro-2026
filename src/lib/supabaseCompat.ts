import { query } from './database';

/**
 * Helper functions to convert Supabase-style queries to PostgreSQL queries
 */

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

class PostgreSQLQueryBuilder implements QueryBuilder {
  private table: string;
  private selectColumns: string = '*';
  private selectCalled: boolean = false;
  private whereConditions: Array<{ column: string; operator: string; value: any }> = [];
  private orderByClause: string = '';
  private limitClause: string = '';
  private operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
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
    this.selectCalled = true;
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
    if (value === null) {
      this.whereConditions.push({ column, operator: 'IS', value: null });
    } else {
      this.whereConditions.push({ column, operator: 'IS', value });
    }
    return this;
  }

  in(column: string, values: any[]): QueryBuilder {
    this.whereConditions.push({ column, operator: 'IN', value: values });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): QueryBuilder {
    const direction = options?.ascending === false ? 'DESC' : 'ASC';
    this.orderByClause = ` ORDER BY ${column} ${direction}`;
    return this;
  }

  limit(count: number): QueryBuilder {
    this.limitClause = ` LIMIT ${count}`;
    return this;
  }

  single(): Promise<{ data: any; error: any }> {
    this.singleResult = true;
    return this.execute();
  }

  then(callback: (result: { data: any[]; error: any }) => any): Promise<any> {
    return this.execute().then(callback);
  }

  private async execute(): Promise<{ data: any; error: any }> {
    try {
      let sql = '';
      const params: any[] = [];
      let paramIndex = 1;

      if (this.operation === 'select') {
        sql = `SELECT ${this.selectColumns} FROM ${this.table}`;
        
        if (this.whereConditions.length > 0) {
          const whereClauses = this.whereConditions.map(cond => {
            if (cond.operator === 'IN') {
              const placeholders = cond.value.map((_: any) => `$${paramIndex++}`).join(', ');
              params.push(...cond.value);
              return `${cond.column} IN (${placeholders})`;
            } else if (cond.operator === 'IS' && cond.value === null) {
              return `${cond.column} IS NULL`;
            } else {
              params.push(cond.value);
              return `${cond.column} ${cond.operator} $${paramIndex++}`;
            }
          });
          sql += ` WHERE ${whereClauses.join(' AND ')}`;
        }
        
        sql += this.orderByClause + this.limitClause;
        
      } else if (this.operation === 'insert') {
        const keys = Object.keys(this.insertData);
        const values = Object.values(this.insertData);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        
        sql = `INSERT INTO ${this.table} (${keys.join(', ')}) VALUES (${placeholders})`;
        params.push(...values);
        
        // Add RETURNING clause if select was called
        if (this.selectCalled) {
          sql += ` RETURNING ${this.selectColumns}`;
        }
        
      } else if (this.operation === 'upsert') {
        const keys = Object.keys(this.upsertData);
        const values = Object.values(this.upsertData);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        
        sql = `INSERT INTO ${this.table} (${keys.join(', ')}) VALUES (${placeholders})`;
        params.push(...values);
        
        // Add ON CONFLICT clause
        if (this.upsertConflict) {
          sql += ` ON CONFLICT (${this.upsertConflict}) DO UPDATE SET `;
          const updateClauses = keys.map(key => `${key} = EXCLUDED.${key}`).join(', ');
          sql += updateClauses;
        }
        
        sql += ' RETURNING *';
        
      } else if (this.operation === 'update') {
        const keys = Object.keys(this.updateData);
        const setClauses = keys.map(key => {
          params.push(this.updateData[key]);
          return `${key} = $${paramIndex++}`;
        }).join(', ');
        
        sql = `UPDATE ${this.table} SET ${setClauses}`;
        
        if (this.whereConditions.length > 0) {
          const whereClauses = this.whereConditions.map(cond => {
            params.push(cond.value);
            return `${cond.column} ${cond.operator} $${paramIndex++}`;
          });
          sql += ` WHERE ${whereClauses.join(' AND ')}`;
        }
        
        sql += ' RETURNING *';
        
      } else if (this.operation === 'delete') {
        sql = `DELETE FROM ${this.table}`;
        
        if (this.whereConditions.length > 0) {
          const whereClauses = this.whereConditions.map(cond => {
            params.push(cond.value);
            return `${cond.column} ${cond.operator} $${paramIndex++}`;
          });
          sql += ` WHERE ${whereClauses.join(' AND ')}`;
        }
        
        sql += ' RETURNING *';
      }

      const result = await query(sql, params);
      
      if (this.singleResult) {
        return { data: result.rows[0] || null, error: null };
      }
      
      return { data: result.rows, error: null };
    } catch (error: any) {
      console.error('Query execution error:', error);
      return { data: null, error };
    }
  }
}

/**
 * Create a Supabase-like interface for PostgreSQL queries
 */
export function from(table: string): QueryBuilder {
  return new PostgreSQLQueryBuilder(table);
}

// Create a db object that mimics Supabase's interface
export const db = {
  from,
  // Stub for realtime functionality (not implemented)
  channel: (name: string) => {
    console.warn('Realtime channels not implemented in PostgreSQL migration');
    return {
      on: () => ({ subscribe: () => {} }),
      subscribe: () => {},
    };
  },
  removeChannel: () => {
    console.warn('Realtime channels not implemented in PostgreSQL migration');
  },
  // Stub for Edge Functions (not implemented)
  functions: {
    invoke: async (functionName: string, options?: any) => {
      console.warn(`Edge function '${functionName}' not implemented in PostgreSQL migration`);
      return { data: null, error: { message: 'Edge functions not implemented' } };
    },
  },
  // Stub for storage (not implemented)
  storage: {
    from: (bucket: string) => ({
      upload: async () => {
        console.warn(`Storage upload to bucket '${bucket}' not implemented`);
        return { data: null, error: { message: 'Storage not implemented' } };
      },
      remove: async () => {
        console.warn(`Storage removal from bucket '${bucket}' not implemented`);
        return { data: null, error: { message: 'Storage not implemented' } };
      },
    }),
  },
};

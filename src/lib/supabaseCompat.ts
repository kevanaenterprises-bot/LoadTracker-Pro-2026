import { query } from './database';

/**
 * Helper functions to convert Supabase-style queries to PostgreSQL queries
 */

export interface QueryBuilder {
  select(columns: string): QueryBuilder;
  insert(data: any): Promise<{ data: any; error: any }>;
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
  private whereConditions: Array<{ column: string; operator: string; value: any }> = [];
  private orderByClause: string = '';
  private limitClause: string = '';
  private operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private updateData: any = null;
  private insertData: any = null;
  private singleResult: boolean = false;

  constructor(table: string) {
    this.table = table;
  }

  select(columns: string = '*'): QueryBuilder {
    this.selectColumns = columns;
    this.operation = 'select';
    return this;
  }

  async insert(data: any): Promise<{ data: any; error: any }> {
    try {
      const keys = Object.keys(data);
      const values = Object.values(data);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      
      const sql = `
        INSERT INTO ${this.table} (${keys.join(', ')})
        VALUES (${placeholders})
        RETURNING *
      `;
      
      const result = await query(sql, values);
      return { data: result.rows[0], error: null };
    } catch (error: any) {
      return { data: null, error };
    }
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
};

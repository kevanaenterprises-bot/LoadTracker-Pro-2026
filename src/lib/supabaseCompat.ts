import { supabase } from './supabase';

/**
 * Direct Supabase client wrapper - queries go directly to Supabase
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
    // Validate column names to prevent SQL injection
    // Allow: column names, *, commas, spaces, colons (for joins), parentheses, and basic SQL functions
    // Note: This also allows Supabase-style joins like "customer:customers(*)"
    const validSelectPattern = /^[a-zA-Z0-9_.*,\s():!-]+$/;
    if (!validSelectPattern.test(columns)) {
      console.error('Invalid column specification:', columns);
      throw new Error('Invalid column specification');
    }
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
      let query = supabase.from(this.table);

      if (this.operation === 'select') {
        query = query.select(this.selectColumns);
        
        for (const cond of this.whereConditions) {
          switch (cond.operator) {
            case '=':
              query = query.eq(cond.column, cond.value);
              break;
            case '!=':
              query = query.neq(cond.column, cond.value);
              break;
            case '>':
              query = query.gt(cond.column, cond.value);
              break;
            case '>=':
              query = query.gte(cond.column, cond.value);
              break;
            case '<':
              query = query.lt(cond.column, cond.value);
              break;
            case '<=':
              query = query.lte(cond.column, cond.value);
              break;
            case 'LIKE':
              query = query.like(cond.column, cond.value);
              break;
            case 'ILIKE':
              query = query.ilike(cond.column, cond.value);
              break;
            case 'IS':
              query = query.is(cond.column, cond.value);
              break;
            case 'IN':
              query = query.in(cond.column, cond.value);
              break;
          }
        }
        
        if (this.orderByClause) {
          const ascMatch = this.orderByClause.match(/ORDER BY (\w+) (ASC|DESC)/);
          if (ascMatch) {
            query = query.order(ascMatch[1], { ascending: ascMatch[2] !== 'DESC' });
          }
        }
        
        if (this.limitClause) {
          const limitMatch = this.limitClause.match(/LIMIT (\d+)/);
          if (limitMatch) {
            query = query.limit(parseInt(limitMatch[1]));
          }
        }
        
      } else if (this.operation === 'insert') {
        query = (query as any).insert(this.insertData);
        
      } else if (this.operation === 'upsert') {
        query = (query as any).upsert(this.upsertData, { onConflict: this.upsertConflict || undefined });
        
      } else if (this.operation === 'update') {
        query = (query as any).update(this.updateData);
        for (const cond of this.whereConditions) {
          switch (cond.operator) {
            case '=':
              query = query.eq(cond.column, cond.value);
              break;
            case '!=':
              query = query.neq(cond.column, cond.value);
              break;
            case '>':
              query = query.gt(cond.column, cond.value);
              break;
            case '>=':
              query = query.gte(cond.column, cond.value);
              break;
            case '<':
              query = query.lt(cond.column, cond.value);
              break;
            case '<=':
              query = query.lte(cond.column, cond.value);
              break;
          }
        }
        
      } else if (this.operation === 'delete') {
        query = (query as any).delete();
        for (const cond of this.whereConditions) {
          switch (cond.operator) {
            case '=':
              query = query.eq(cond.column, cond.value);
              break;
            case '!=':
              query = query.neq(cond.column, cond.value);
              break;
            case '>':
              query = query.gt(cond.column, cond.value);
              break;
            case '>=':
              query = query.gte(cond.column, cond.value);
              break;
            case '<':
              query = query.lt(cond.column, cond.value);
              break;
            case '<=':
              query = query.lte(cond.column, cond.value);
              break;
          }
        }
      }

      const { data, error } = await query;
      
      if (error) {
        throw error;
      }
      
      if (this.singleResult) {
        return { data: data?.[0] || null, error: null };
      }
      
      return { data, error: null };
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

// Helper functions for Supabase function calls

async function invokeGeocodeLocation(body: any) {
  const { data, error } = await supabase.functions.invoke('geocode-location', {
    body,
  });

  if (error) {
    return { data: null, error: { message: error.message || 'Geocoding failed' } };
  }

  return { data, error: null };
}

async function invokeGeocodeAndSaveLocation(body: any) {
  const { data, error } = await supabase.functions.invoke('geocode-and-save-location', {
    body,
  });

  if (error) {
    return { data: null, error: { message: error.message || 'Geocoding failed' } };
  }

  return { data, error: null };
}

async function invokeReverseGeocode(body: any) {
  const { data, error } = await supabase.functions.invoke('reverse-geocode', {
    body,
  });

  if (error) {
    return { data: null, error: { message: error.message || 'Reverse geocoding failed' } };
  }

  return { data, error: null };
}

async function invokeCalculateRoute(body: any) {
  const { data, error } = await supabase.functions.invoke('calculate-truck-route', {
    body,
  });

  if (error) {
    return { data: null, error: { message: error.message || 'Route calculation failed' } };
  }

  return { data, error: null };
}

async function invokeGetMapConfig() {
  const { data, error } = await supabase.functions.invoke('get-map-config');

  if (error) {
    return { data: null, error: { message: error.message || 'Failed to get map config' } };
  }

  return { data, error: null };
}

// Create a db object that mimics Supabase's interface
export const db = {
  from,
  // Supabase realtime client
  channel: (name: string) => supabase.channel(name),
  removeChannel: (channel: any) => supabase.removeChannel(channel),
  // Edge Functions - invokes Supabase edge functions
  functions: {
    invoke: async (functionName: string, options?: any) => {
      const body = options?.body || {};
      
      try {
        // Invoke Supabase edge function directly
        const { data, error } = await supabase.functions.invoke(functionName, {
          body,
        });

        if (error) {
          console.error(`Edge function '${functionName}' error:`, error);
          return { 
            data: null, 
            error: { message: error.message || 'Function invocation failed' } 
          };
        }

        return { data, error: null };
      } catch (error: any) {
        console.error(`Edge function '${functionName}' error:`, error);
        return { 
          data: null, 
          error: { message: error.message || 'Function invocation failed' } 
        };
      }
    },
  },
  // Storage - uses Supabase storage
  storage: supabase.storage,
};

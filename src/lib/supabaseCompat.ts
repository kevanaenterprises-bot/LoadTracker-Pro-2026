import { query } from './database';

/**
 * Helper functions to convert Supabase-style queries to PostgreSQL queries
 */

// API URL for REST endpoints
// NOTE: In production, this assumes frontend and backend are served from the same origin.
// If using separate domains (e.g., api.example.com and app.example.com), set VITE_API_URL explicitly.
const API_URL = import.meta.env.VITE_API_URL || 
  (typeof window !== 'undefined' && window.location.hostname === 'localhost' 
    ? 'http://localhost:3001' 
    : typeof window !== 'undefined' ? window.location.origin : '');

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
          // Validate conflict columns to prevent SQL injection
          const conflictColumns = this.upsertConflict.split(',').map(col => col.trim());
          const validColumnPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
          if (!conflictColumns.every(col => validColumnPattern.test(col))) {
            throw new Error('Invalid conflict column names');
          }
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

// Helper functions for edge function API calls

async function invokeGeocodeLocation(body: any) {
  const response = await fetch(`${API_URL}/api/geocode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: body.address,
      city: body.city,
      state: body.state,
      zip: body.zip,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    return { data: null, error: { message: error.error || 'Geocoding failed' } };
  }

  const data = await response.json();
  return { data, error: null };
}

async function invokeGeocodeAndSaveLocation(body: any) {
  const response = await fetch(`${API_URL}/api/geocode-and-save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location_id: body.location_id,
      address: body.address,
      city: body.city,
      state: body.state,
      zip: body.zip,
      geofence_radius: body.geofence_radius,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    return { data: null, error: { message: error.error || 'Geocoding failed' } };
  }

  const data = await response.json();
  return { data, error: null };
}

async function invokeReverseGeocode(body: any) {
  const response = await fetch(`${API_URL}/api/reverse-geocode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      latitude: body.latitude,
      longitude: body.longitude,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    return { data: null, error: { message: error.error || 'Reverse geocoding failed' } };
  }

  const data = await response.json();
  return { data, error: null };
}

async function invokeCalculateRoute(body: any) {
  const response = await fetch(`${API_URL}/api/calculate-route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      waypoints: body.waypoints,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    return { data: null, error: { message: error.error || 'Route calculation failed' } };
  }

  const data = await response.json();
  return { data, error: null };
}

async function invokeGetMapConfig() {
  const response = await fetch(`${API_URL}/api/here-config`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const error = await response.json();
    return { data: null, error: { message: error.error || 'Failed to get map config' } };
  }

  const data = await response.json();
  return { data, error: null };
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
  // Edge Functions - now calls REST API endpoints on Express server
  functions: {
    invoke: async (functionName: string, options?: any) => {
      // Map edge function names to REST API endpoints
      const body = options?.body || {};
      const action = body.action;

      try {
        // Route based on action parameter
        switch (action) {
          case 'geocode-location':
            return await invokeGeocodeLocation(body);
          
          case 'geocode-and-save-location':
            return await invokeGeocodeAndSaveLocation(body);
          
          case 'reverse-geocode':
            return await invokeReverseGeocode(body);
          
          case 'calculate-truck-route':
          case 'calculate-route':
          case 'get-route-for-load':
            return await invokeCalculateRoute(body);
          
          case 'get-map-config':
            return await invokeGetMapConfig();
          
          default:
            console.warn(`Edge function action '${action}' not implemented`);
            return { 
              data: null, 
              error: { message: `Action '${action}' not implemented` } 
            };
        }
      } catch (error: any) {
        console.error(`Edge function '${functionName}' error:`, error);
        return { 
          data: null, 
          error: { message: error.message || 'Function invocation failed' } 
        };
      }
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

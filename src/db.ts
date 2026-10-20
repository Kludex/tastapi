import logfire from 'logfire'
import { Client } from 'pg'

export class DbConn {
  private env: Env
  private client: Client | null = null

  constructor(env: Env) {
    this.env = env
  }

  /**
   * Executes a query and returns the first row.
   * Usage is like
   * ```
   * const user = await connection.first<{ name: string }>('SELECT name FROM users WHERE id = :userId', { userId })
   * console.log(user!.name)
   * ```
   */
  async first<T>(queryTemplate: SqlString, paramsLookup: ParamsLookup = {}): Promise<T | undefined> {
    const { query, params } = buildQuery(queryTemplate, paramsLookup)
    const rows = await this.raw<T>(query, params)
    return rows[0]
  }

  /**
   * Executes a query and returns all rows.
   * Usage is like
   * ```
   * const users = await connection.all<{ id: number, name: string }>('SELECT id, name FROM users')
   * console.log(users.map(user => user.name))
   * ```
   */
  async all<T>(queryTemplate: SqlString, paramsLookup: ParamsLookup = {}): Promise<T[]> {
    const { query, params } = buildQuery(queryTemplate, paramsLookup)
    return await this.raw(query, params)
  }

  /**
   * Executes a query without returning any rows.
   * Usage is like
   * ```
   * await connection.execute('UPDATE users SET name = :name WHERE id = :id', { name: 'John', id: 1 })
   * ```
   */
  async execute(queryTemplate: SqlString, paramsLookup: ParamsLookup = {}): Promise<void> {
    const { query, params } = buildQuery(queryTemplate, paramsLookup)
    await this.raw(query, params)
  }

  async raw<T>(sql: string, params: QueryParam[] = []): Promise<T[]> {
    const client = await this.connect()

    const result = await logfire.span(sql.trim().split(/\s+/)[0] || 'query', {
      callback: async () => {
        // console.log(sql)
        return await client.query(sql, params)
      },
      attributes: {
        'db.name': client.database,
        'db.statement': sql,
        'db.system': 'postgresql',
        'db.user': client.user,
        'net.peer.port': client.port,
        'net.transport': 'hyperdrive',
      },
    })
    return result.rows
  }

  async close() {
    if (this.client) {
      await this.client.end()
    }
  }

  private async connect(): Promise<Client> {
    if (!this.client) {
      // Support both Cloudflare Hyperdrive (production) and direct DATABASE_URL (self-hosted)
      const connectionString = this.env.HYPERDRIVE?.connectionString ?? this.env.DATABASE_URL
      if (!connectionString) {
        throw new Error('No database connection string available. Set HYPERDRIVE or DATABASE_URL.')
      }
      const client = new Client({ connectionString })

      await logfire.span('database connect', {
        callback: async () => await client.connect(),
        attributes: {
          'db.name': client.database,
          'db.system': 'postgresql',
          'db.user': client.user,
          'net.peer.port': client.port,
          'net.transport': 'hyperdrive',
        },
      })

      if (this.env.TESTING === 'TRUE') {
        const pgSchema = await this.env.KV.get('TESTING_PG_SCHEMA')
        if (typeof pgSchema === 'string') {
          await client.query(`SET search_path TO ${pgSchema}`)
        } else {
          throw new Error('TESTING_PG_SCHEMA not set in KV, this is required for testing')
        }
      }
      this.client = client
    }
    return this.client
  }
}

export interface SqlString {
  sql: string
}

export function joinSql(strings: SqlString[], sql: SqlString): SqlString {
  return { sql: strings.map((s) => s.sql).join(sql.sql) }
}

export function sql(strings: TemplateStringsArray, ...args: (SqlString | undefined)[]): SqlString {
  return { sql: strings.reduce((result, str, i) => result + str + (args[i] !== undefined ? args[i].sql : ''), '') }
}

type QueryParam = string | number | boolean | null
type ParamsLookup = Record<string, QueryParam | QueryParam[] | QueryParam[][] | undefined>

// build a query, only exported so it can be used in tests
export function buildQuery(
  queryTemplate: SqlString,
  paramsLookup: ParamsLookup,
): { query: string; params: QueryParam[] } {
  const params: QueryParam[] = []
  let paramIndex = 1
  const subbed: Record<string, number> = {}

  function subVar(key: string, value: QueryParam): string {
    const alreadyIndex = subbed[key]
    if (alreadyIndex !== undefined) {
      return `$${alreadyIndex}`
    }
    subbed[key] = paramIndex
    params.push(value)
    return `$${paramIndex++}`
  }

  const replacePlaceholder = (matchString: string, _: string, prefix?: string, key?: string) => {
    // prefix and key are undefined if we match on a single or double quoted string
    if (typeof prefix === 'undefined' || typeof key === 'undefined') {
      return matchString
    }
    if (!(key in paramsLookup)) {
      console.error(`Missing parameter for template variable: "${key}"`, queryTemplate)
      throw new Error(`Missing parameter for template variable: "${key}"`)
    }
    const value = paramsLookup[key] ?? null
    if (Array.isArray(value)) {
      if (value.length === 0) {
        throw new Error(`Empty array parameter for template variable: "${key}"`)
      }
      if (isNestedArray(value)) {
        // for nested arrays we assume each group is an insert values group
        // so we build each group and concatenate them like `(?, ?, ?), `
        const groups: string[] = []
        for (const subArray of value) {
          if (subArray.length === 0) {
            throw new Error(`Empty sub array parameter for template variable: "${key}"`)
          }
          params.push(...subArray)
          groups.push(`(${subArray.map(() => `$${paramIndex++}`).join(', ')})`)
        }
        return prefix + groups.join(', ')
      } else {
        params.push(...value)
        return prefix + value.map(() => `$${paramIndex++}`).join(',')
      }
    } else {
      return `${prefix}${subVar(key, value)}`
    }
  }

  const query = queryTemplate.sql
    .replace(/('.*?'|".*?"|([^\\:]):([a-zA-Z][a-zA-Z0-9_]*[a-zA-Z]))/g, replacePlaceholder)
    .replace(/\\:/g, ':')

  // console.log({ query, params })
  return { query, params }
}

function isNestedArray(value: QueryParam[] | QueryParam[][]): value is QueryParam[][] {
  return value.some(Array.isArray)
}

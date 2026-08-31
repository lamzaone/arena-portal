export const MYSQL_UTC_CLIENT_TIMEZONE = "Z" as const;

export const MYSQL_UTC_SESSION_SQL =
  "SET SESSION time_zone = '+00:00'" as const;

type MysqlSessionConnection = {
  query(
    sql: string,
    callback: (error: Error | null) => void,
  ): unknown;
  destroy(): void;
};

type MysqlSessionPool = {
  on(
    event: "connection",
    listener: (connection: MysqlSessionConnection) => void,
  ): unknown;
};

/**
 * mysql2's `timezone` option controls Date encoding/decoding, but it does not
 * set MySQL's session time zone. Queue the session command as soon as the core
 * pool creates a connection; mysql2 preserves command order, so the first
 * application query cannot overtake it. Destroy the connection if the server
 * refuses the UTC session rather than letting it operate in local time.
 */
export function installMysqlUtcSessionInitializer(pool: MysqlSessionPool) {
  pool.on("connection", (connection) => {
    connection.query(MYSQL_UTC_SESSION_SQL, (error) => {
      if (error) connection.destroy();
    });
  });
}

const tableName = 'website_data'
const sql = {
  tableName,
  createTable: `
    CREATE TABLE IF NOT EXISTS  ${tableName} (
      host VARCHAR(200) NOT NULL,
      path VARCHAR(1024) NOT NULL,
      url VARCHAR(4096) NOT NULL,
      url_hash VARCHAR(64) NOT NULL,
      path_hash VARCHAR(64) NOT NULL,
      response_data_hash VARCHAR(64),
      content_type VARCHAR(50),
      create_time INTEGER NOT NULL,
      last_accessed INTEGER NOT NULL,
      server_time INTEGER,
      server_last_modified TEXT,
      expire_time TEXT,
      server_name TEXT,
      request_header TEXT NOT NULL,
      response_header TEXT NOT NULL,
      content_encoding VARCHAR(50),
      cache_name TEXT,
      cache_control TEXT,
      etag VARCHAR(50),
      server_ip_address VARCHAR(30),
      url_length INT,
      response_data_length INT,
      info TEXT,
      update_count INT
    )
  `,

  inster: `
    INSERT INTO ${tableName} VALUES (
      ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
    )
  `,

  createSelectCode: function (columnName, limit, offset) {
    return `
      SELECT * FROM ${tableName} WHERE ${columnName}=? LIMIT ${limit || 1000} OFFSET ${offset || 0}
    `
  },

  createSelectAllCode: function (limit, offset, columnNameArr) {
    let column = '*'
    if (Array.isArray(columnNameArr) && columnNameArr.length) {
      column = columnNameArr.join(',')
    }

    return `
      SELECT ${column} FROM ${tableName} LIMIT ${limit || 1000} OFFSET ${offset || 0}
    `
  },

  update: `
    UPDATE ${tableName}
    SET host = ?, path = ?, url = ?, url_hash = ?, path_hash = ?, response_data_hash = ?, content_type = ?, create_time = ?, last_accessed = ?, server_time = ?, server_last_modified = ?, expire_time = ?, server_name = ?, request_header = ?, response_header = ?, content_encoding = ?, cache_name = ?, cache_control = ?, etag = ?, server_ip_address = ?, url_length = ?, response_data_length = ?, info = ?, update_count = ?
    WHERE url_hash=?
  `,

  delete: `
    DELETE FROM ${tableName} WHERE url_hash = ?
  `,

  createIndexCode: function (columnName, unique) {
    return `
      CREATE ${unique ? 'UNIQUE' : ''} INDEX IF NOT EXISTS ${columnName}_index
    ON ${tableName} (${columnName})
    `
  }
}

module.exports = sql

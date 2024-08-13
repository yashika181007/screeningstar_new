const crypto = require('crypto');
const pool = require('../config/db');

const generateToken = () => crypto.randomBytes(32).toString('hex');
const getTokenExpiry = () => new Date(Date.now() + 3600000).toISOString();

const Batch = {
  isAdminTokenValid: (_token, admin_id, callback) => {
    const sql = `
      SELECT \`login_token\`, \`token_expiry\`
      FROM \`admins\`
      WHERE \`id\` = ?
    `;

    pool.query(sql, [admin_id], (err, results) => {
      if (err) {
        console.error('Database query error:', err);
        return callback({ status: false, message: 'Database error' }, null);
      }

      if (results.length === 0) {
        return callback({ status: false, message: 'Admin not found' }, null);
      }

      const currentToken = results[0].login_token;
      const tokenExpiry = new Date(results[0].token_expiry);
      const currentTime = new Date();

      if (_token !== currentToken) {
        return callback({ status: false, message: 'Invalid token provided' }, null);
      }

      if (tokenExpiry > currentTime) {
        // Token is valid and matches the provided token
        callback(null, { status: true, message: 'Token is valid' });
      } else {
        // Token is expired, generate and save a new one
        const newToken = generateToken();
        const newTokenExpiry = getTokenExpiry();

        const updateSql = `
          UPDATE \`admins\`
          SET \`login_token\` = ?, \`token_expiry\` = ?
          WHERE \`id\` = ?
        `;

        pool.query(updateSql, [newToken, newTokenExpiry, admin_id], (updateErr) => {
          if (updateErr) {
            console.error('Error updating token:', updateErr);
            return callback({ status: false, message: 'Error updating token' }, null);
          }

          callback(null, { status: true, message: 'Token was expired and has been refreshed', newToken });
        });
      }
    });
  },
};

module.exports = Batch;
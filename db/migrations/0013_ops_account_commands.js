const fs = require('node:fs');
const path = require('node:path');
exports.up = pgm => pgm.sql(fs.readFileSync(path.join(__dirname, '../sql/0013_ops_account_commands.sql'), 'utf8'));
exports.down = () => { throw new Error('Use a reviewed forward migration or isolated backup restore.'); };

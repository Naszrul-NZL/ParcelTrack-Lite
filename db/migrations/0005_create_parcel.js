const fs = require('node:fs');
const path = require('node:path');
exports.up = pgm => pgm.sql(fs.readFileSync(path.join(__dirname, '../sql/0005_create_parcel.sql'), 'utf8'));
exports.down = () => { throw new Error('Use a reviewed forward migration or isolated backup restore.'); };

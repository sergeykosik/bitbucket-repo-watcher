// import parseScheduleDate from '../index';
const main = require('../index');

describe('basic tests', () => {
  it('should parse date', () => {
    const parsed = main.parseScheduleDate('hour:21,minute:10');
    expect(parsed.hour).toBe(21);
    expect(parsed.minute).toBe(10);
  });
});

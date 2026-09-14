import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const DAY = 86400000;
export function cellValue(xml, address, value) {
  const re = new RegExp(
    `<c\\b([^>]*?\\br="${address}"[^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/c>)`,
  );
  const m = xml.match(re);
  if (!m) throw Error(`В шаблоне нет ячейки ${address}.`);
  const attr = m[1].replace(/\s+t="[^"]*"/g, '');
  const content =
    value === ''
      ? `<c${attr}/>`
      : typeof value === 'number'
        ? `<c${attr}><v>${value}</v></c>`
        : `<c${attr} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  return xml.replace(re, () => content);
}
export function datesForWeek(start, index) {
  const d = new Date(start + 'T00:00:00Z');
  if (!Number.isFinite(+d)) throw Error('Укажи дату начала занятий.');
  const monday = +d - ((d.getUTCDay() + 6) % 7) * DAY + index * 7 * DAY;
  return Array.from({ length: 5 }, (_, i) => new Date(monday + i * DAY));
}
export const displayDate = (d) =>
  `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
export function exportSchedule(
  template,
  lessons,
  {
    start = '2026-09-01',
    firstWeek = 'odd',
    timeMode = 'template',
    aliases = {},
    includeTeachers = false,
  } = {},
) {
  if (!['odd', 'even'].includes(firstWeek))
    throw Error('Не задан тип первой недели.');
  const startDay = new Date(start + 'T00:00:00Z').getUTCDay();
  if (startDay === 0 || startDay === 6)
    throw Error(
      'Выбери рабочий день начала занятий. В шаблоне понедельник — пятница.',
    );
  const zip = unzipSync(new Uint8Array(template));
  if (!zip['xl/worksheets/sheet3.xml'] || zip['xl/worksheets/sheet4.xml'])
    throw Error('Нужен исходный шаблон с тремя листами.');
  const sourceTimes = new Map();
  for (const l of lessons) {
    const key = `${l.day}:${l.slot}`;
    if (
      sourceTimes.has(key) &&
      sourceTimes.get(key) !== l.time &&
      timeMode === 'pdf'
    )
      throw Error('В исходниках различается время одной пары.');
    sourceTimes.set(key, l.time);
  }
  let book = strFromU8(zip['xl/workbook.xml']);
  for (let week = 0; week < 3; week++) {
    const parity =
      week % 2 ? (firstWeek === 'odd' ? 'even' : 'odd') : firstWeek;
    const title = `${week + 1} неделя (${parity === 'odd' ? 'нечетная' : 'четная'})`;
    // Names, sheet count, relationships and layout stay in their original order.
    book = book.replace(
      new RegExp(`(<sheet\\b[^>]*name=")[^"]*("[^>]*sheetId="${week + 1}")`),
      `$1${title}$2`,
    );
    const key = `xl/worksheets/sheet${week + 1}.xml`;
    let xml = strFromU8(zip[key]);
    xml = cellValue(xml, 'B1', title);
    const dates = datesForWeek(start, week),
      from = new Date(Math.max(+dates[0], +new Date(start + 'T00:00:00Z')));
    xml = cellValue(
      xml,
      'B2',
      `с ${displayDate(from)} по ${displayDate(dates[4])}`,
    );
    for (let day = 0; day < 5; day++) {
      const base = 4 + day * 7;
      xml = cellValue(
        xml,
        `E${base}`,
        Math.round((+dates[day] - Date.UTC(1899, 11, 30)) / DAY),
      );
      for (let slot = 1; slot <= 5; slot++) {
        const row = base + slot;
        const active = +dates[day] >= +new Date(start + 'T00:00:00Z');
        const matches = active
          ? lessons.filter(
              (l) =>
                l.day === day &&
                l.slot === slot &&
                (l.week === parity || l.week === 'both'),
            )
          : [];
        if (matches.length > 1 && !includeTeachers)
          throw Error(
            `${title}: несколько занятий на ${day + 1}-й день, пару ${slot}. Убери пересечение перед выгрузкой.`,
          );
        const ordered = matches.sort((a, b) =>
          a.teacher.localeCompare(b.teacher, 'ru'),
        );
        xml = cellValue(
          xml,
          `D${row}`,
          ordered
            .map(
              (lesson) =>
                lesson.group + (lesson.subgroup ? '/' + lesson.subgroup : ''),
            )
            .join('\n'),
        );
        xml = cellValue(
          xml,
          `E${row}`,
          ordered
            .map(
              (lesson) =>
                `${aliases[lesson.subject] || lesson.subject}${includeTeachers ? ` (${lesson.teacher.split(' ')[0]})` : ''}`,
            )
            .join('\n'),
        );
        xml = cellValue(xml, `G${row}`, '');
        if (timeMode === 'pdf' && sourceTimes.has(`${day}:${slot}`))
          xml = cellValue(xml, `C${row}`, sourceTimes.get(`${day}:${slot}`));
      }
    }
    zip[key] = strToU8(xml);
  }
  zip['xl/workbook.xml'] = strToU8(book);
  return zipSync(zip, { level: 6 });
}

// Layout parser for the supplied college timetable format. No AI guesses.
export const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница'];
const unique = (xs, t = 0.9) =>
  xs
    .sort((a, b) => a - b)
    .reduce((a, x) => {
      if (!a.length || x - a.at(-1) > t) a.push(x);
      return a;
    }, []);
const teacherRx =
  /([А-ЯЁ][а-яё]+(?:[-][А-ЯЁ][а-яё]+)?\s+[А-ЯЁ]\s*\.\s*[А-ЯЁ]\s*\.)/g;
export const normalizeName = (s) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/\s*\.\s*/g, '.')
    .trim();
function lines(items) {
  const rows = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let row = rows.find((r) => Math.abs(r.y - item.y) < 0.7);
    if (!row) {
      row = { y: item.y, items: [] };
      rows.push(row);
    }
    row.items.push(item);
  }
  return rows
    .sort((a, b) => a.y - b.y)
    .map((r) => ({
      ...r,
      text: r.items
        .sort((a, b) => a.x - b.x)
        .reduce(
          (s, it, i, a) =>
            s +
            (i && it.x - (a[i - 1].x + a[i - 1].w) > 0.65 ? ' ' : '') +
            it.str,
          '',
        )
        .trim(),
    }))
    .filter((r) => r.text);
}
export function geometryFromOperators(op, OPS, height) {
  const rects = [];
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const point = (x, y) => [
    m[0] * x + m[2] * y + m[4],
    m[1] * x + m[3] * y + m[5],
  ];
  for (let i = 0; i < op.fnArray.length; i++) {
    const fn = op.fnArray[i],
      a = op.argsArray[i];
    if (fn === OPS.save) stack.push([...m]);
    else if (fn === OPS.restore) m = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) {
      const n = a;
      m = [
        m[0] * n[0] + m[2] * n[1],
        m[1] * n[0] + m[3] * n[1],
        m[0] * n[2] + m[2] * n[3],
        m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4],
        m[1] * n[4] + m[3] * n[5] + m[5],
      ];
    } else if (fn === OPS.constructPath && a[2]?.length === 4) {
      const b = a[2],
        ps = [
          point(b[0], b[1]),
          point(b[2], b[1]),
          point(b[0], b[3]),
          point(b[2], b[3]),
        ];
      const x0 = Math.min(...ps.map((p) => p[0])),
        x1 = Math.max(...ps.map((p) => p[0])),
        top = height - Math.max(...ps.map((p) => p[1])),
        bottom = height - Math.min(...ps.map((p) => p[1]));
      if (x1 - x0 > 5 && bottom - top < 1.2)
        rects.push({ x0, x1, y: (top + bottom) / 2 });
    }
  }
  return rects;
}
const normalizedItems = (items, height, offset = 0, page = 1) =>
  items
    .filter((t) => t.str?.trim())
    .map((t) => ({
      str: t.str,
      x: t.transform[4],
      y: offset + height - t.transform[5],
      w: t.width,
      h: t.height,
      page,
    }));
function timeSlots(ts, heading, left, horizontal) {
  const values = ts
    .filter(
      (t) =>
        t.x >= heading.x - 2 &&
        t.x < left - 1 &&
        /^\d{2}[.:]\d{2}-?$/.test(t.str),
    )
    .sort((a, b) => a.y - b.y);
  const raw = [];
  for (let i = 0; i < values.length; i++) {
    const start = values[i];
    if (!start.str.endsWith('-')) continue;
    const end = values
      .slice(i + 1)
      .find(
        (t) =>
          t.page === start.page &&
          t.y > start.y &&
          t.y - start.y < 12 &&
          !t.str.endsWith('-'),
      );
    if (end)
      raw.push({
        time: `${start.str.replace(/[.-]$/, '').replace('.', ':')} - ${end.str.replace('.', ':')}`,
        startY: start.y,
        endY: end.y,
        page: start.page,
        endPage: end.page,
      });
  }
  const merged = [];
  for (const slot of raw) {
    const previous = merged.at(-1);
    if (
      previous &&
      slot.page > previous.endPage &&
      slot.time === previous.time
    ) {
      previous.endY = slot.endY;
      previous.endPage = slot.endPage;
      continue;
    }
    merged.push(slot);
  }
  const timeX = heading.x + heading.w / 2;
  const acrossTime = unique(
    horizontal
      .filter((line) => line.x0 <= timeX && line.x1 >= timeX)
      .map((line) => line.y),
  );
  const between = (a, b, dayBreak = false) => {
    const candidates = unique(
      horizontal
        .filter(
          (l) =>
            l.x0 <= timeX &&
            l.x1 >= timeX &&
            l.y > a.endY + 0.2 &&
            l.y < b.startY - 0.2,
        )
        .map((l) => l.y),
    );
    const middle = a.endY + (b.startY - a.endY) * (dayBreak ? 0.2 : 0.5);
    return (
      candidates.sort(
        (x, y) => Math.abs(x - middle) - Math.abs(y - middle),
      )[0] ?? middle
    );
  };
  const firstTop =
    acrossTime.filter((y) => y > heading.y && y < merged[0]?.startY).at(-1) ??
    Math.max(heading.y + 3, (merged[0]?.startY ?? heading.y) - 16);
  const lastBottom =
    acrossTime.find((y) => y > merged.at(-1)?.endY) ??
    (merged.at(-1)?.endY ?? firstTop) + 16;
  return merged.map((slot, index) => ({
    ...slot,
    top: index ? between(merged[index - 1], slot, index % 5 === 0) : firstTop,
    bottom:
      index < merged.length - 1
        ? between(slot, merged[index + 1], (index + 1) % 5 === 0)
        : lastBottom,
  }));
}
function parseNormalized(ts, horizontal, source) {
  const heading = ts.find((t) => t.str === 'Часы');
  if (!heading)
    throw Error(
      'Не найдена колонка «Часы». Нужен PDF с текстом и таблицей как в образце.',
    );
  const groups = ts
    .filter(
      (t) => Math.abs(t.y - heading.y) < 4 && /^\d{2,4}[КKА-Я]?$/.test(t.str),
    )
    .map((t) => {
      const suffix = ts.find(
        (s) =>
          /^[КKА-Я]$/.test(s.str) &&
          Math.abs(s.y - t.y) < 0.5 &&
          Math.abs(s.x - t.x - t.w) < 1,
      );
      return suffix
        ? { ...t, str: t.str + suffix.str, w: suffix.x + suffix.w - t.x }
        : t;
    })
    .sort((a, b) => a.x - b.x);
  if (groups.length < 2)
    throw Error(
      'Не удалось определить колонки групп. Этот формат пока не поддерживается.',
    );
  const centers = groups.map((t) => t.x + t.w / 2),
    step = centers[1] - centers[0];
  const left = centers[0] - step / 2,
    right = centers.at(-1) + step / 2;
  const slots = timeSlots(ts, heading, left, horizontal);
  if (slots.length !== 25)
    throw Error(
      `Ожидалось пять дней по пять пар. Распознано временных слотов: ${slots.length} из 25.`,
    );
  const lessons = [],
    warnings = [];
  for (let day = 0; day < 5; day++) {
    for (let slot = 0; slot < 5; slot++) {
      const current = slots[day * 5 + slot],
        st = current.top,
        end = current.bottom,
        time = current.time;
      for (let g = 0; g < groups.length; g++) {
        const gx0 = g === 0 ? left : (centers[g - 1] + centers[g]) / 2,
          gx1 =
            g === groups.length - 1 ? right : (centers[g] + centers[g + 1]) / 2;
        const splits = unique(
          horizontal
            .filter(
              (l) =>
                l.x0 < gx0 + 4 &&
                l.x1 > gx1 - 4 &&
                l.y > st + 1 &&
                l.y < end - 1,
            )
            .map((l) => l.y),
        );
        if (splits.length > 1)
          throw Error(
            `${groups[g].str}, ${DAYS[day]}, пара ${slot + 1}: больше двух частей ячейки. Нужна ручная проверка исходника.`,
          );
        const parts = splits.length
          ? [
              { a: st, b: splits[0], week: 'odd' },
              { a: splits[0], b: end, week: 'even' },
            ]
          : [{ a: st, b: end, week: 'both' }];
        for (const part of parts) {
          const rows = lines(
            ts.filter(
              (t) =>
                t.x >= gx0 + 1 &&
                t.x < gx1 - 1 &&
                t.y > part.a + 0.3 &&
                t.y < part.b,
            ),
          );
          if (!rows.length) continue;
          let subject = [],
            lastSubject = '',
            found = 0;
          for (const row of rows) {
            const matches = [...row.text.matchAll(teacherRx)];
            if (!matches.length) {
              subject.push(row.text);
              continue;
            }
            const rawSubject = subject.join(' ').trim() || lastSubject;
            if (!rawSubject) {
              warnings.push(
                `${groups[g].str}, ${DAYS[day]}, ${slot + 1}: не определён предмет (${row.text}).`,
              );
              continue;
            }
            lastSubject = rawSubject;
            subject = [];
            for (const match of matches) {
              const sub = rawSubject.match(/[-–]?\s*([12])\s*п\s*\/\s*г\s*$/i);
              const title = rawSubject
                .replace(/[-–]?\s*[12]\s*п\s*\/\s*г\s*$/i, '')
                .trim();
              const room = row.text.slice(match.index + match[0].length).trim();
              const page = row.items[0]?.page || heading.page || 1;
              lessons.push({
                id: `${source}:${page}:${day}:${slot}:${g}:${part.week}:${found++}`,
                teacher: normalizeName(match[0]),
                group: groups[g].str.replace('K', 'К'),
                subgroup: sub?.[1] || '',
                subject: title,
                week: part.week,
                day,
                slot: slot + 1,
                time,
                room,
                source,
                page,
                bbox: [gx0, part.a, gx1, part.b],
              });
            }
          }
          if (subject.length || !found)
            warnings.push(
              `${groups[g].str}, ${DAYS[day]}, пара ${slot + 1}: не разобран текст «${subject.join(' ')}».`,
            );
        }
      }
    }
  }
  return {
    lessons,
    warnings,
    groups: groups.map((g) => g.str.replace('K', 'К')),
  };
}
export function parsePage(items, horizontal, height, source, page = 1) {
  return parseNormalized(
    normalizedItems(items, height, 0, page),
    horizontal,
    source,
  );
}
export async function readPdf(data, name, onProgress = (_message) => {}) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (typeof window !== 'undefined')
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdf.worker.min.mjs',
      window.location.href,
    ).href;
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const doc = await task.promise;
  try {
    if (doc.numPages > 30)
      throw Error('В одном PDF поддерживается до 30 страниц.');
    const result = { lessons: [], warnings: [], groups: [] },
      chunks = [];
    for (let n = 1; n <= doc.numPages; n++) {
      onProgress(`${name} · страница ${n} из ${doc.numPages}`);
      const p = await doc.getPage(n);
      if (p.rotate) throw Error('Поворот страниц пока не поддерживается.');
      const txt = await p.getTextContent(),
        op = await p.getOperatorList(),
        height = p.view[3] - p.view[1];
      const startsTable = txt.items.some((t) => t.str === 'Часы');
      if (startsTable) chunks.push({ items: [], horizontal: [], height: 0 });
      const chunk = chunks.at(-1);
      if (!chunk)
        throw Error('Первая страница не содержит заголовок таблицы «Часы».');
      chunk.items.push(...normalizedItems(txt.items, height, chunk.height, n));
      chunk.horizontal.push(
        ...geometryFromOperators(op, pdfjs.OPS, height).map((l) => ({
          ...l,
          y: l.y + chunk.height,
        })),
      );
      chunk.height += height;
    }
    for (const chunk of chunks) {
      const r = parseNormalized(chunk.items, chunk.horizontal, name);
      result.lessons.push(...r.lessons);
      result.warnings.push(...r.warnings);
      result.groups.push(...r.groups);
    }
    return { ...result, groups: [...new Set(result.groups)] };
  } finally {
    await task.destroy();
  }
}
export function deduplicate(lessons) {
  const seen = new Set();
  return lessons.filter((l) => {
    const k = [
      l.teacher,
      l.group,
      l.subgroup,
      l.subject,
      l.week,
      l.day,
      l.slot,
      l.time,
      l.room,
    ].join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
export function conflicts(lessons) {
  const res = [];
  for (const week of ['odd', 'even'])
    for (let d = 0; d < 5; d++)
      for (let s = 1; s <= 5; s++) {
        const ls = lessons.filter(
          (l) =>
            l.day === d &&
            l.slot === s &&
            (l.week === week || l.week === 'both'),
        );
        if (ls.length > 1) res.push({ week, day: d, slot: s, lessons: ls });
      }
  return res;
}

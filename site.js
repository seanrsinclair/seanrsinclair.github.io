document.querySelectorAll('#publications table:not(.award-list)').forEach((table) => {
  const titleCell = table.querySelector('tbody tr:first-child td:first-child');
  const titleRow = table.querySelector('tbody tr:first-child');
  if (!titleCell || !titleRow) {
    return;
  }

  const titleLinks = [...titleCell.querySelectorAll('a')];
  const arxivLink = titleLinks.find((link) => /arxiv\.org\/abs\//i.test(link.href));
  const journalLink = titleLinks.find((link) =>
    !/arxiv\.org\/abs\/|youtube\.com|youtu\.be/i.test(link.href)
  );
  const videoLinks = titleLinks.filter((link) => /youtube\.com|youtu\.be/i.test(link.href));
  const venueCell = titleRow.children.length > 1 ? titleRow.lastElementChild : null;
  const venue = venueCell?.textContent.trim() || '';

  table.classList.add('publication-table');
  const card = document.createElement('article');
  card.className = 'paper-card selected-paper';
  table.before(card);
  card.append(table);

  titleLinks.forEach((link) => link.remove());
  venueCell?.remove();

  const authorRow = table.querySelector('tbody tr:nth-child(2)');
  const authorCell = authorRow?.querySelector('td:first-child');
  if (authorCell) {
    const authors = authorCell.textContent.trim().split(/(,\s*|\s+and\s+)/);
    authorCell.replaceChildren(...authors.map((author) => {
      if (/^(,\s*|\s+and\s+)$/.test(author)) {
        return document.createTextNode(author);
      }
      const normalized = author.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalized === 'seanrsinclair') {
        return document.createTextNode(author);
      }
      const collaborator = document.createElement('span');
      collaborator.className = 'selected-paper-collaborator';
      collaborator.textContent = author;
      return collaborator;
    }));
  }

  if (venue) {
    const venueLine = document.createElement('p');
    venueLine.className = 'selected-paper-venue';
    venueLine.textContent = venue;
    card.append(venueLine);
  }

  const noteRows = [...table.querySelectorAll('tbody tr:nth-child(n+3)')].sort((a, b) => {
    const aIsAward = /\b(?:award|competition)\b/i.test(a.textContent || '');
    const bIsAward = /\b(?:award|competition)\b/i.test(b.textContent || '');
    if (aIsAward === bIsAward) {
      return 0;
    }
    return aIsAward ? -1 : 1;
  });

  noteRows.forEach((row) => {
    const cell = row.querySelector('td:first-child');
    if (!cell || !cell.textContent.trim()) {
      row.remove();
      return;
    }

    const note = document.createElement('p');
    note.className = /\b(?:award|competition)\b/i.test(cell.textContent)
      ? 'selected-paper-recognition'
      : 'selected-paper-note';
    note.textContent = cell.textContent.replace(/\s+/g, ' ').trim();
    if (note.classList.contains('selected-paper-recognition')) {
      const medal = document.createElement('span');
      medal.setAttribute('aria-hidden', 'true');
      medal.textContent = '🏅';
      note.prepend(medal, document.createTextNode(' '));
    }
    card.append(note);
    row.remove();
  });

  const paperUrl = journalLink?.href || arxivLink?.href;
  if (paperUrl || videoLinks.length) {
    const actions = document.createElement('p');
    actions.className = 'home-paper-actions';
    card.append(actions);

    if (paperUrl) {
      const paperButton = document.createElement('a');
      paperButton.className = 'btn btn-default';
      paperButton.href = paperUrl;
      paperButton.target = '_blank';
      paperButton.rel = 'noopener noreferrer';
      paperButton.setAttribute('role', 'button');
      paperButton.textContent = 'Paper';
      actions.append(paperButton);
    }

    videoLinks.forEach((link, index) => {
      const videoButton = document.createElement('a');
      videoButton.className = 'btn btn-default';
      videoButton.href = link.href;
      videoButton.target = '_blank';
      videoButton.rel = 'noopener noreferrer';
      videoButton.setAttribute('role', 'button');
      videoButton.textContent = videoLinks.length > 1 ? `Video ${index + 1}` : 'Video';
      actions.append(videoButton);
    });
  }
});

const parseCsv = (csv) => {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (inQuotes) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      inQuotes = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      row.push(field);
      if (row.some((value) => value.trim())) {
        rows.push(row);
      }
      row = [];
      field = '';
      if (character === '\r' && csv[index + 1] === '\n') {
        index += 1;
      }
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    throw new Error('The co-author links CSV contains an unterminated quoted field.');
  }
  row.push(field);
  if (row.some((value) => value.trim())) {
    rows.push(row);
  }

  return rows;
};

const loadCoauthorLinks = async () => {
  const response = await fetch('sinclair_files/coauthor-links.csv');
  if (!response.ok) {
    throw new Error(`Could not load co-author links CSV: ${response.status} ${response.statusText}`);
  }

  const rows = parseCsv((await response.text()).replace(/^\uFEFF/, ''));
  const [headers, ...records] = rows;
  if (!headers || headers[0]?.trim() !== 'name' || headers[1]?.trim() !== 'url') {
    throw new Error('The co-author links CSV must have "name,url" as its header.');
  }

  const links = new Map();
  records.forEach((record, index) => {
    const name = record[0]?.trim();
    const rawUrl = record[1]?.trim();
    if (!name || record.length !== 2) {
      throw new Error(`Invalid co-author links CSV entry on row ${index + 2}.`);
    }
    if (!rawUrl) {
      return;
    }

    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`Invalid URL for ${name} in co-author links CSV.`);
    }

    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (links.has(key)) {
      throw new Error(`Duplicate co-author name "${name}" in co-author links CSV.`);
    }
    links.set(key, url.href);
  });

  document.querySelectorAll('.selected-paper-collaborator').forEach((collaborator) => {
    const key = collaborator.textContent.toLowerCase().replace(/[^a-z0-9]/g, '');
    const url = links.get(key);
    if (!url) {
      return;
    }

    const link = document.createElement('a');
    link.className = collaborator.className;
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = collaborator.textContent;
    collaborator.replaceWith(link);
  });
};

loadCoauthorLinks().catch((error) => {
  console.error('Unable to apply co-author links.', error);
});

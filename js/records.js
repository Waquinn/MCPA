/* Shared read models. Each visit reads current records; no business-data cache. */
(function () {
  'use strict';
  const labels = {
    AVAILABLE: 'Available', IN_USE: 'In use', REPAIR: 'For repair', FOR_REPAIR: 'For repair',
    UNDER_REPAIR: 'Under repair', MISSING: 'Missing', DISPOSED: 'Disposed', PENDING: 'Pending',
    PARTIAL: 'Partially received', RECEIVED: 'Received', CANCELLED: 'Cancelled',
    APPROVED: 'Approved', RELEASED: 'Released', COMPLETED: 'Completed', OPEN: 'Open'
  };
  const esc = value => window.MCPA.escapeHTML(String(value ?? ''));
  const status = value => labels[String(value || '').toUpperCase()] || String(value || 'Unspecified');
  const quantity = row => Number.isFinite(Number(row.quantity)) ? Number(row.quantity) : 0;
  const date = value => {
    if (!value) return '—';
    const text = String(value);
    const parsed = new Date(text.length === 10 ? text + 'T12:00:00+08:00' : text);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString(undefined, { timeZone: 'Asia/Manila', dateStyle: 'medium', ...(text.length === 10 ? {} : { timeStyle: 'short' }) });
  };
  const person = row => row ? row.full_name || row.name || row.display_name || row.email || row.id : 'Unassigned';
  const map = rows => new Map((rows || []).map(row => [String(row.id), row]));
  const requestReference = row => 'CR-' + String(row.request_number).padStart(5, '0');
  async function readSources(names) {
    const results = await Promise.allSettled(names.map(name => window.MCPA.readAll(name)));
    const data = {}, errors = {};
    results.forEach((result, index) => {
      const name = names[index];
      if (result.status === 'fulfilled') data[name] = result.value;
      else {
        data[name] = []; errors[name] = result.reason;
        console.error('Unable to read ' + name, result.reason);
      }
    });
    return { data, errors };
  }
  function csv(columns, rows) {
    const cell = value => {
      let text = String(value ?? '');
      // Formula injection may follow spaces and control characters.
      if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    return '\ufeff' + [columns, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
  }
  function download(name, columns, rows) {
    const url = URL.createObjectURL(new Blob([csv(columns, rows)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = name + '.csv';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function renderTable(head, body, columns, rows, empty = 'No matching records.') {
    head.innerHTML = '<tr>' + columns.map(title => '<th scope="col">' + esc(title) + '</th>').join('') + '</tr>';
    body.innerHTML = rows.length ? rows.map(row => '<tr>' + row.map(value => '<td>' + esc(value) + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + columns.length + '" class="empty-state">' + esc(empty) + '</td></tr>';
  }
  function readableErrors(errors) {
    const names = { equipment: 'equipment', sites: 'sites', profiles: 'profile names', equipment_transfers: 'equipment movements', equipment_history: 'equipment history', consumables: 'consumables', consumable_requests: 'purchase requests', consumable_stock_movements: 'stock history' };
    const failed = Object.keys(errors).map(name => names[name] || name);
    return failed.length ? 'Could not load ' + failed.join(', ') + '. Refresh to retry; some records may be unavailable to your account.' : '';
  }
  window.MCPARecords = { esc, status, quantity, date, person, map, requestReference, readSources, csv, download, renderTable, readableErrors };
})();

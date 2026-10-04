/* UI permissions mirror the database migration. Database policies remain authoritative. */
(function () {
  'use strict';
  const operational = ['engineer', 'architect'];
  const monitoring = ['admin', 'tool_handler'];
  const routes = {
    admin: ['dashboard','masterlist','tool-profile','sites','site-detail','request','transfer','return','repair','missing','consumables','purchase','reports','activity','users','settings'],
    engineer: ['dashboard','masterlist','tool-profile','sites','site-detail','request','transfer','return','repair','missing','activity','settings'],
    architect: ['dashboard','masterlist','tool-profile','sites','site-detail','request','transfer','return','repair','missing','activity','settings'],
    secretary: ['consumables','purchase','settings'],
    tool_handler: ['dashboard','masterlist','tool-profile','sites','site-detail','transfer','return','repair','missing','activity','settings']
  };
  const actions = {
    admin: ['approveRequest','rejectRequest','releaseRequest','startRepair','completeRepair','recoverMissing'],
    engineer: ['createRequest','createTransfer','receiveTransfer','createReturn','reportRepair','reportMissing'],
    architect: ['createRequest','createTransfer','receiveTransfer','createReturn','reportRepair','reportMissing'],
    secretary: [], tool_handler: ['createTransfer']
  };
  window.MCPAPermissions = Object.freeze({
    labels: {admin:'Admin',engineer:'Engineer',architect:'Architect',secretary:'Secretary',tool_handler:'Tool Handler'},
    route: (role, route) => !!routes[role]?.includes(route),
    action: (role, action) => !!actions[role]?.includes(action),
    operational: role => operational.includes(role),
    fullInventory: role => monitoring.includes(role),
    home: role => role === 'secretary' ? 'consumables' : 'dashboard'
  });
})();

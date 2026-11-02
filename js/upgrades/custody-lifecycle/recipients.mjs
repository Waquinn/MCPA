// Profile UUID remains authoritative; display only already-authorized directory context.
export function recipientLabel(person,data){
 const projects=(data.sites||[]).filter(s=>person.role==='admin'?s.office:s.assignedEngineerId===person.id).map(s=>s.name);
 const duplicate=(data.recipients||[]).some(p=>p.id!==person.id&&p.name===person.name&&p.role===person.role);
 const role=({engineer:'Engr',architect:'Architect',admin:'Admin'})[person.role]||'Role not recorded';
 return [person.name,role,projects.join(', ')||'No eligible destination',duplicate?'Profile '+person.id:''].filter(Boolean).join(' \u00b7 ');
}

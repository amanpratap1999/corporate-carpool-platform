const fs = require('fs');
let code = fs.readFileSync('src/domain/state-machines/ride-state-machine.ts', 'utf8');

code = code.replace(
  "return { ...ride, status: 'IN_PROGRESS', updated_at: new Date().toISOString() };",
  "return { ...ride, status: 'IN_PROGRESS', started_at: new Date().toISOString(), updated_at: new Date().toISOString() };"
);

code = code.replace(
  "return { ...ride, status: 'COMPLETED', updated_at: new Date().toISOString() };",
  "return { ...ride, status: 'COMPLETED', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() };"
);

code = code.replace(
  "return { ...ride, status: 'CANCELLED', cancelled_reason: reason, updated_at: new Date().toISOString() };",
  "return { ...ride, status: 'CANCELLED', cancelled_reason: reason, cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() };"
);

fs.writeFileSync('src/domain/state-machines/ride-state-machine.ts', code, 'utf8');


let code2 = fs.readFileSync('src/domain/state-machines/ride-request-state-machine.ts', 'utf8');

code2 = code2.replace(
  "return { ...request, status: 'REJECTED', rejection_reason: reason, updated_at: new Date().toISOString() };",
  "return { ...request, status: 'REJECTED', rejection_reason: reason, responded_at: new Date().toISOString(), updated_at: new Date().toISOString() };"
);

code2 = code2.replace(
  "return {\n      updatedRequest: { ...request, status: 'ACCEPTED', updated_at: now },",
  "return {\n      updatedRequest: { ...request, status: 'ACCEPTED', responded_at: now, updated_at: now },"
);

code2 = code2.replace(
  "return {\n      updatedRequest: { ...request, status: 'CANCELLED', cancellation_reason: reason, updated_at: now },",
  "return {\n      updatedRequest: { ...request, status: 'CANCELLED', cancellation_reason: reason, cancelled_at: now, updated_at: now },"
);

fs.writeFileSync('src/domain/state-machines/ride-request-state-machine.ts', code2, 'utf8');

console.log("State machines updated!");

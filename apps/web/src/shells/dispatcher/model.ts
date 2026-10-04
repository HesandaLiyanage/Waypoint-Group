export type Order = { id: string; outlet: string; name: string; district: string; temp: 'Chilled' | 'Ambient'; kg: number; volume: number; skips: number; vanOnly: boolean; priority: boolean; trip: string | null; reason: string; nextDate: string; proposal: string; decisionNote: string; reviewed: boolean; source: 'planner' | 'dispatcher' };
export type Trip = { id: string; vehicle: string; kind: 'Truck' | 'Van'; temp: 'Chilled' | 'Ambient'; district: string; driver: string; kg: number; volume: number; minutes: number; depart: string; eta: string };
export const deliveryDate = '2026-10-05';
export const trips: Trip[] = [
  { id: 'TRP-0842', vehicle: 'VEH014', kind: 'Truck', temp: 'Chilled', district: 'Colombo', driver: 'K. Perera', kg: 2200, volume: 16, minutes: 165, depart: '03:30', eta: '06:15' },
  { id: 'TRP-0843', vehicle: 'VEH008', kind: 'Truck', temp: 'Chilled', district: 'Gampaha', driver: 'S. Fernando', kg: 3500, volume: 28, minutes: 195, depart: '03:45', eta: '07:00' },
  { id: 'TRP-0844', vehicle: 'VEH022', kind: 'Van', temp: 'Chilled', district: 'Colombo', driver: 'T. Silva', kg: 900, volume: 7, minutes: 180, depart: '03:45', eta: '06:45' },
  { id: 'TRP-0845', vehicle: 'VEH031', kind: 'Truck', temp: 'Ambient', district: 'Gampaha', driver: 'M. Bandara', kg: 3000, volume: 24, minutes: 160, depart: '03:45', eta: '06:25' },
];
const outlets = ['Kollupitiya Central','Borella Fresh','Maradana Market','Gampaha North','Negombo Lagoon','Sea Street Express','Fort Central','Kadawatha Fresh','Cinnamon Gardens','Havelock Market','Nugegoda Fresh','Wattala Central'];
export function initialState(): DispatchState {
  return { closed: false, generated: false, recorded: false, confirmed: false, issueResolved: false, issueNote: '', issueStatus: 'open', instruction: null, capacityPlans: {}, audit: [], orders: outlets.map((name, i) => ({ id: `ORD-${92300+i}`, outlet: `OUT${String(i+1).padStart(3,'0')}`, name, district: [3,4,7,11].includes(i) ? 'Gampaha' : 'Colombo', temp: i % 3 === 1 ? 'Ambient' : 'Chilled', kg: i===8?2000:i===9?1000:150+i*35, volume: Number((1+i*.22).toFixed(2)), skips: i===8 ? 2 : i===9 ? 1 : 0, vanOnly: i===5, priority: i===8, trip: null, reason: '', nextDate: '2026-10-06', proposal: '', decisionNote: '', reviewed: false, source: 'planner' })) };
}
export type Instruction = { action: 'alternate' | 'wait' | 'reattempt' | 'return'; note: string; reviewTime: string };
export type CapacityPlan = { shift: number; reefer: number; ambient: number; note: string };
export type DispatchState = { closed: boolean; generated: boolean; recorded: boolean; confirmed: boolean; issueResolved: boolean; issueNote: string; issueStatus: 'open' | 'acknowledged' | 'awaiting' | 'resolved'; instruction: Instruction | null; capacityPlans: Record<string, CapacityPlan>; audit: string[]; orders: Order[] };
export function loadFor(orders: Order[], trip: string) { return orders.filter(o=>o.trip===trip).reduce((a,o)=>({kg:a.kg+o.kg, volume:Number((a.volume+o.volume).toFixed(2))}),{kg:0,volume:0}); }
export function tripMinutes(trip: Trip, count: number) { return trip.minutes + count * 15; }
export function tripFuel(trip: Trip, count: number) { return Number(((trip.district==='Colombo'?30:50)+Math.max(0,count-1)*6)/5).toFixed(1); }
export function compatibility(order: Order, trip: Trip, orders: Order[]): string[] {
  const load=loadFor(orders.filter(o=>o.id!==order.id),trip.id);
  const count=orders.filter(o=>o.trip===trip.id&&o.id!==order.id).length+1;
  const [hour,minute]=trip.depart.split(':').map(Number);
  return [Number(tripFuel(trip,count))>12?'Weekly fuel allowance exceeded':'', hour*60+minute+tripMinutes(trip,count)>480?'Fresh 08:00 delivery window exceeded':'', order.district!==trip.district ? 'Different district' : '', order.vanOnly && trip.kind!=='Van' ? 'Van-only access' : '', order.temp==='Chilled' && trip.temp!=='Chilled' ? 'Refrigeration required' : '', load.kg+order.kg>trip.kg ? 'Weight capacity exceeded' : '', load.volume+order.volume>trip.volume ? 'Volume capacity exceeded' : '', tripMinutes(trip,count)>270 ? 'Trip time exceeded' : ''].filter(Boolean);
}
export function planWarnings(state: DispatchState) { return state.orders.flatMap(o=>{const t=trips.find(t=>t.id===o.trip);return t?compatibility(o,t,state.orders).map(reason=>({order:o,reason})):[];}); }
export const deferred = (s: DispatchState) => s.orders.filter(o=>!o.trip);
// Snapshot of db/seed/data/calendar.csv for the isolated frontend demo.
export const operatingDates: string[] = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"];
export function validNextDate(date: string) { const d=new Date(date+'T00:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===date && date>deliveryDate && operatingDates.includes(date); }
export function canRecord(s: DispatchState) { return s.generated && !s.confirmed && deferred(s).every(o=>o.reviewed && o.reason.trim() && validNextDate(o.nextDate) && (o.skips===0 || o.decisionNote.trim().length>=10)); }
export function canConfirm(s: DispatchState) { return s.generated && s.closed && !s.confirmed && !planWarnings(s).length && (!deferred(s).length || s.recorded); }
export type Action = { type: 'close' | 'generate' | 'record' | 'confirm' | 'reset' } | { type: 'priority'; id: string } | { type: 'reassign'; id: string; trip: string } | { type: 'deferral'; id: string; reason: string; nextDate: string } | { type: 'resolve'; note: string; confirmed?: boolean } | { type: 'defer'; id: string; reason: string; nextDate: string; note: string } | { type: 'review'; id: string; note: string; accepted: boolean } | { type: 'ack' } | { type: 'instruct'; instruction: Instruction; coordinated: boolean } | { type: 'capacity'; depot: string; plan: CapacityPlan; agreed?: boolean };
export function reducer(s: DispatchState,a: Action): DispatchState {
  if(a.type==='reset')return initialState();
  if(a.type==='ack')return s.issueStatus==='open'?{...s,issueStatus:'acknowledged',audit:[...s.audit,'Delivery incident acknowledged.']}:s;
  if(a.type==='instruct') {
    const timeValid=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(a.instruction.reviewTime) && a.instruction.reviewTime>'06:10' && a.instruction.reviewTime<'08:00';
    if(s.issueStatus==='open'||s.issueResolved||!a.coordinated||a.instruction.note.trim().length<10||!timeValid)return s;
    return {...s,instruction:a.instruction,issueStatus:'awaiting',audit:[...s.audit,`Instruction recorded: ${a.instruction.action}; review ${a.instruction.reviewTime} LK.`]};
  }
  if(a.type==='resolve')return s.issueStatus==='awaiting' && a.confirmed && a.note.trim().length>=10?{...s,issueResolved:true,issueStatus:'resolved',issueNote:a.note.trim(),audit:[...s.audit,'Driver/outlet outcome confirmed; incident closed.']}:s;
  if(a.type==='capacity')return ['Peliyagoda','Kandy'].includes(a.depot) && (a.plan.shift===0||a.agreed) && a.plan.shift<=(a.depot==='Kandy'?39:100) && [a.plan.shift,a.plan.reefer,a.plan.ambient].every(n=>Number.isFinite(n)&&n>=0) && a.plan.shift<=100 && a.plan.reefer<=200 && a.plan.ambient<=200 && a.plan.note.trim().length>=10?{...s,capacityPlans:{...s.capacityPlans,[a.depot]:a.plan},audit:[...s.audit,`Capacity action plan saved for ${a.depot}; resources not reserved.`]}:s;
  if(s.confirmed)return s;
  if(a.type==='close')return {...s,closed:true};
  if(a.type==='priority')return s.closed?s:{...s,orders:s.orders.map(o=>o.id===a.id?{...o,priority:!o.priority}:o)};
  if(a.type==='generate') {
    if(!s.closed||s.generated)return s;
    let orders=s.orders.map(o=>({...o,trip:null as string|null}));
    const priority=[...orders].sort((a,b)=>b.skips-a.skips||Number(b.priority)-Number(a.priority)||Number(b.vanOnly)-Number(a.vanOnly));
    for(const order of priority) {
      const candidate=trips.find(t=>!compatibility(order,t,orders).length);
      orders=orders.map(o=>o.id===order.id?{...o,trip:candidate?.id??null,proposal:candidate?'':trips.map(t=>`${t.vehicle}: ${compatibility(order,t,orders).join(', ')}`).join(' · '),reason:candidate?'':'No compatible trip',reviewed:false}:o);
    }
    return {...s,generated:true,orders,audit:[...s.audit,'Draft generated using previous skips, priority and access needs; unassigned orders require dispatcher review.']};
  }
  if(a.type==='defer') {
    if(!s.generated||!s.orders.some(o=>o.id===a.id&&o.trip)||!a.reason.trim()||a.note.trim().length<10||!validNextDate(a.nextDate))return s;
    return {...s,recorded:false,orders:s.orders.map(o=>o.id===a.id?{...o,trip:null,reason:a.reason,nextDate:a.nextDate,decisionNote:a.note,reviewed:true,source:'dispatcher'}:o),audit:[...s.audit,`${a.id} deferred by dispatcher: ${a.reason}.`]};
  }
  if(a.type==='review')return {...s,recorded:false,orders:s.orders.map(o=>o.id===a.id&&!o.trip?{...o,decisionNote:a.note,reviewed:a.accepted}:o)};
  if(a.type==='reassign') { const o=s.orders.find(o=>o.id===a.id),t=trips.find(t=>t.id===a.trip);return !s.generated||!o||!t||compatibility(o,t,s.orders).length?s:{...s,recorded:false,orders:s.orders.map(o=>o.id===a.id?{...o,trip:a.trip,reason:'',proposal:'',reviewed:false,decisionNote:''}:o)}; }
  if(a.type==='deferral')return !s.generated?s:{...s,recorded:false,orders:s.orders.map(o=>o.id===a.id&&!o.trip?{...o,reason:a.reason,nextDate:a.nextDate,reviewed:false}:o)};
  if(a.type==='record')return canRecord(s)?{...s,recorded:true}:s;
  if(a.type==='confirm')return canConfirm(s)?{...s,confirmed:true}:s;
  return s;
}

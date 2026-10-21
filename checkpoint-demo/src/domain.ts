export type Role = 'SELLER' | 'RIDER' | 'ADMIN';
export type Status = 'REGISTERED' | 'ASSIGNED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED';
export type User = { id: string; name: string; username: string; role: Role; active: boolean };
export type History = { status: Status; at: string; actor: string };
export type Parcel = { id: string; tracking: string; sellerId: string; riderId: string | null; recipient: string; phone: string; address: string; weight: number; status: Status; history: History[]; proof?: string };
export type DemoState = { users: User[]; parcels: Parcel[] };
export const statuses: Status[] = ['REGISTERED', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED'];
export const label = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
export function seed(): DemoState {
  const users: User[] = [
    { id: 'seller-a', name: 'Seller A', username: 'seller.a', role: 'SELLER', active: true },
    { id: 'seller-b', name: 'Seller B', username: 'seller.b', role: 'SELLER', active: true },
    { id: 'rider-a', name: 'Rider A', username: 'rider.a', role: 'RIDER', active: true },
    { id: 'rider-b', name: 'Rider B', username: 'rider.b', role: 'RIDER', active: true },
    { id: 'admin', name: 'Administrator', username: 'admin', role: 'ADMIN', active: true }
  ];
  const parcels: Parcel[] = statuses.map((status, i) => ({
    id: `sample-${i + 1}`, tracking: `PTL-${(i + 1).toString(16).toUpperCase().padStart(32, 'A')}`,
    sellerId: i === 4 ? 'seller-b' : 'seller-a', riderId: i ? 'rider-a' : null,
    recipient: `Recipient ${i + 1}`, phone: '+60000000000', address: `${i + 1} Jalan 1, Bandar Baru`,
    weight: 1.5 + i * 0.25, status,
    history: statuses.slice(0, status === 'FAILED' ? 3 : i + 1).concat(status === 'FAILED' ? ['FAILED'] : []).map((s, n) => ({ status: s, at: `2026-10-21T0${n + 1}:00:00Z`, actor: s === 'REGISTERED' ? (i === 4 ? 'Seller B' : 'Seller A') : s === 'ASSIGNED' ? 'Administrator' : 'Rider A' }))
  }));
  return { users, parcels };
}
export function visibleParcels(state: DemoState, user: User) {
  if (!user.active) return [];
  return state.parcels.filter(p => user.role === 'ADMIN' || (user.role === 'SELLER' ? p.sellerId === user.id : p.riderId === user.id));
}
export function publicHistory(parcel: Parcel) { return parcel.history.map(({status, at}) => ({status, at})); }
export function validateParcel(input: { recipient: string; phone: string; address: string; weight: string }) {
  const errors: Record<string, string> = {};
  if (!input.recipient.trim() || input.recipient.trim().length > 100) errors.recipient = 'Enter a recipient name of 1 to 100 characters.';
  if (!/^(?:\+\d{8,15}|0\d{8,10})$/.test(input.phone.replace(/[\s()-]/g, ''))) errors.phone = 'Enter a local number starting with 0 or an international number starting with +.';
  if (input.address.trim().length < 5 || input.address.length > 500) errors.address = 'Enter an address of 5 to 500 characters.';
  if (!/^\d+(?:\.\d{1,3})?$/.test(input.weight) || Number(input.weight) <= 0 || Number(input.weight) > 100) errors.weight = 'Enter 0.001 to 100 kg, with up to 3 decimal places.';
  return errors;
}
export function makeTracking() { return 'PTL-' + Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('').toUpperCase(); }
export function assign(state: DemoState, actor: User, parcelId: string, riderId: string): DemoState {
  const parcel = state.parcels.find(p => p.id === parcelId);
  const rider = state.users.find(u => u.id === riderId);
  if (!actor.active || actor.role !== 'ADMIN' || !rider?.active || rider.role !== 'RIDER' || !parcel || ['DELIVERED','FAILED'].includes(parcel.status)) throw new Error('Choose an active Rider and an unfinished parcel.');
  return { ...state, parcels: state.parcels.map(p => p.id !== parcelId ? p : { ...p, riderId, status: p.status === 'REGISTERED' ? 'ASSIGNED' : p.status, history: p.status === 'REGISTERED' ? [...p.history, {status: 'ASSIGNED', at: new Date().toISOString(), actor: actor.name}] : p.history }) };
}
export function transition(state: DemoState, actor: User, parcelId: string, next: Status, proof?: string): DemoState {
  const parcel = state.parcels.find(p => p.id === parcelId);
  if (!actor.active || actor.role !== 'RIDER' || parcel?.riderId !== actor.id) throw new Error('Only the assigned active Rider can update this parcel.');
  const allowed = parcel.status === 'ASSIGNED' ? next === 'OUT_FOR_DELIVERY' : parcel.status === 'OUT_FOR_DELIVERY' && ['DELIVERED','FAILED'].includes(next);
  if (!allowed) throw new Error('This status change is not allowed.');
  if (['DELIVERED', 'FAILED'].includes(next) && !proof) throw new Error('Choose one JPG or PNG proof photo.');
  return { ...state, parcels: state.parcels.map(p => p.id !== parcelId ? p : { ...p, status: next, proof: proof || p.proof, history: [...p.history, {status: next, at: new Date().toISOString(), actor: actor.name}] }) };
}

import { describe, expect, it } from 'vitest';

import { createRosterSnapshot, rosterSnapshotScope } from '../apps/timeclock/src/rosterSnapshot';



describe('Timeclock roster snapshots', () => {

  it('refreshes idle scopes daily but freezes a selected event across midnight and DST', () => {

    for (const midnight of ['2026-10-22T05:00:00Z','2026-11-02T06:00:00Z','2027-03-15T05:00:00Z']) {

      const at = Date.parse(midnight);

      expect(rosterSnapshotScope(null,at)).not.toBe(rosterSnapshotScope(null,at-1));

      expect(rosterSnapshotScope('event-a',at)).toBe(rosterSnapshotScope('event-a',at-1));

      expect(rosterSnapshotScope('event-b',at)).not.toBe(rosterSnapshotScope('event-a',at));

    }

  });

  it('fences old event responses and clears previous names while a new event loads',async()=>{

    const pending:Array<(data:string[])=>void>=[];

    const store=createRosterSnapshot(()=>new Promise<string[]>(resolve=>pending.push(resolve)));

    const first=store.load('event:a'); pending[0](['Synthetic A']); await first;

    expect(store.getSnapshot().data).toEqual(['Synthetic A']);

    const old=store.load('event:b');

    expect(store.getSnapshot().data).toBeUndefined();

    const current=store.load('event:c');pending[2](['Synthetic C']);await current;

    pending[1](['Late B']);await old;

    expect(store.getSnapshot()).toMatchObject({scope:'event:c',data:['Synthetic C'],error:false});

  });

  it('recovers failed daily and selected event fetches through an explicit retry',async()=>{

    let failed=true;

    const store=createRosterSnapshot(async()=>{if(failed)throw Error('offline');return ['Synthetic'];});

    for(const scope of ['day:1','event:a']){

      failed=true;await store.load(scope);

      expect(store.getSnapshot()).toMatchObject({scope,error:true,pending:false});

      failed=false;await store.load(scope);

      expect(store.getSnapshot()).toMatchObject({scope,data:['Synthetic'],error:false});

    }

  });

  it('measures one idle fetch per day and one fetch per event selection across midnight',async()=>{
    let calls=0,lastScope='';
    const store=createRosterSnapshot(async()=>++calls);
    const render=async(session:string|null,now:number)=>{
      const scope=rosterSnapshotScope(session,now);
      if(scope!==lastScope){lastScope=scope;await store.load(scope)}
    };
    const midnight=Date.parse('2026-10-22T05:00:00Z');
    await render(null,midnight-3600000);
    for(let i=1;i<240;i++)await render(null,midnight-3600000+i*15000);
    expect(calls).toBe(1);
    await render(null,midnight);expect(calls).toBe(2);
    await render('a',midnight);expect(calls).toBe(3);
    for(let i=1;i<=5760;i++)await render('a',midnight+i*15000);
    expect(calls).toBe(3);
    await render('b',midnight+86400000);expect(calls).toBe(4);
  });
  it('reuses the same day idle snapshot after leaving an event',async()=>{
    let calls=0;
    const store=createRosterSnapshot(async()=>++calls);
    await store.load('day:1');await store.load('event:a');await store.load('day:1');
    expect(calls).toBe(2);expect(store.getSnapshot().data).toBe(1);
    await store.load('day:2');expect(calls).toBe(3);
  });
  it('deduplicates a pending same-scope request during StrictMode effect replay',async()=>{
    let calls=0,resolve!:(data:string[])=>void;
    const store=createRosterSnapshot(()=>{calls++;return new Promise<string[]>(done=>{resolve=done})});
    const request=store.load('event:a');await store.load('event:a');
    expect(calls).toBe(1);expect(store.getSnapshot().pending).toBe(true);
    resolve(['Synthetic']);await request;
    expect(store.getSnapshot()).toMatchObject({scope:'event:a',data:['Synthetic'],pending:false});
  });
  it('does not publish after its operator view unmounts',async()=>{

    let resolve!:(data:string[])=>void;

    const store=createRosterSnapshot(()=>new Promise<string[]>(done=>{resolve=done}));

    const request=store.load('event:a');store.cancel();resolve(['Synthetic']);await request;

    expect(store.getSnapshot().data).toBeUndefined();

  });

});


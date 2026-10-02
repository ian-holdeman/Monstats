import { Worker } from 'node:worker_threads';
import type { SQLInputValue } from 'node:sqlite';
import type { Counter } from '../domain/dynamic-matchups';

// Only local read-only SQL and composition grouping run here; calculations remain
// in the tested engine. Bounded workers keep SQLite scans off the request thread.
const code = `
const { parentPort } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
parentPort.on('message', ({path, sql, values}) => {
  let db;
  try {
    db = new DatabaseSync(path, {readOnly:true});
    db.exec('PRAGMA busy_timeout = 5000');
    const grouped = new Map();
    for (const p of db.prepare(sql).iterate(...values)) {
      let c = grouped.get(p.composition);
      if (!c) { c = {wins:0,outcomes:0,matches:new Set(),events:new Set(),players:new Set(),matchEvents:new Map(),eventSources:new Map()}; grouped.set(p.composition,c); }
      c.wins += p.win; c.outcomes++;
      c.matches.add(p.physical); c.events.add(p.canonical); c.players.add(p.participant);
      c.matchEvents.set(p.physical,p.canonical);
      c.eventSources.set(p.canonical,(p.providers || '').split(',').filter(Boolean));
    }
    parentPort.postMessage({grouped});
  } catch (e) { parentPort.postMessage({error:e.message}); }
  finally { if (db) db.close(); }
});`;
type Job = {
  path: string;
  sql: string;
  values: SQLInputValue[];
  resolve: (value: Map<string, Counter>) => void;
  reject: (error: Error) => void;
};
const waiting: Job[] = [];
const pool: { worker: Worker; job: Job | null }[] = [];
function dispatch() {
  for (const slot of pool) {
    if (slot.job || !waiting.length) continue;
    slot.job = waiting.shift()!;
    slot.worker.ref();
    const { path, sql, values } = slot.job;
    slot.worker.postMessage({ path, sql, values });
  }
}
export function scanMatchupGroups(
  path: string,
  sql: string,
  values: SQLInputValue[],
): Promise<Map<string, Counter>> {
  if (!pool.length)
    for (let i = 0; i < 2; i++) {
      const slot = {
        worker: new Worker(code, { eval: true }),
        job: null as Job | null,
      };
      slot.worker.unref();
      slot.worker.on(
        'message',
        (message: { grouped: Map<string, Counter>; error?: string }) => {
          if (message.error) slot.job?.reject(new Error(message.error));
          else slot.job?.resolve(message.grouped);
          slot.job = null;
          slot.worker.unref();
          dispatch();
        },
      );
      slot.worker.on('error', (error) => {
        slot.job?.reject(error);
        slot.job = null;
        for (const job of waiting.splice(0)) job.reject(error);
        const index = pool.indexOf(slot);
        if (index >= 0) pool.splice(index, 1);
        void slot.worker.terminate();
      });
      slot.worker.on('exit', (status) => {
        slot.job?.reject(new Error(`Matchup scan interrupted (${status})`));
        slot.job = null;
        const index = pool.indexOf(slot);
        if (index >= 0) pool.splice(index, 1);
        if (!pool.length)
          for (const job of waiting.splice(0))
            job.reject(new Error('Matchup scan interrupted'));
        else dispatch();
      });
      slot.worker.unref();
      pool.push(slot);
    }
  if (waiting.length >= 8)
    return Promise.reject(new Error('Matchup query capacity reached'));
  return new Promise((resolve, reject) => {
    waiting.push({ path, sql, values, resolve, reject });
    dispatch();
  });
}

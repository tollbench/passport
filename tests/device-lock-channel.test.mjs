// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnerLockChannel} from '../src/toll_passport/web/device-lock-channel.mjs';

const identity={ownerBinding:'x'.repeat(32),parentOrigin:'https://app.example'};
test('lock-only signal reaches the same owner, not another owner, without private data',()=>{
  const rooms=new Map(),sent=[];
  class Channel {
    constructor(name){this.name=name;const members=rooms.get(name)||new Set();members.add(this);rooms.set(name,members);}
    postMessage(value){sent.push(value);for(const peer of rooms.get(this.name))if(peer!==this)peer.onmessage?.({data:value});}
    close(){rooms.get(this.name).delete(this);}
  }
  const win={BroadcastChannel:Channel};
  let same=0,other=0;
  const sender=createOwnerLockChannel(identity,()=>{},win);
  const recipient=createOwnerLockChannel(identity,()=>{same++;},win);
  const stranger=createOwnerLockChannel({...identity,ownerBinding:'y'.repeat(32)},()=>{other++;},win);
  sender.broadcast();
  assert.equal(same,1);assert.equal(other,0);assert.deepEqual(sent,[{type:'lock'}]);
  recipient.close();sender.close();stranger.close();
});

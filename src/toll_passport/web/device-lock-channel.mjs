// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
// Same-origin lock notification only. No key, vault data, or unlock command.
import {validateStorageIdentity} from './hosted-bridge.mjs';

export function createOwnerLockChannel(identity,onLock,win=window) {
  if (!validateStorageIdentity(identity) || typeof onLock!=='function') throw Error('invalid');
  if (typeof win.BroadcastChannel!=='function') return {broadcast(){},close(){}};
  const channel=new win.BroadcastChannel(`passport-lock-v1:${identity.parentOrigin}:${identity.ownerBinding}`);
  channel.onmessage=event=>{if(event.data?.type==='lock'&&Object.keys(event.data).length===1)onLock();};
  return {
    broadcast(){channel.postMessage({type:'lock'});},
    close(){channel.close();}
  };
}

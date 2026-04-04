(function () {
     'use strict';
     const _win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
     const HACK_CONFIG = {
         'HoverChassisParams.tiltStabilityScale': 61.47483647,
         'HorizontalAimingParams.angleStep': 0.003999,
         'VerticalAimingParams.elevationAngleUp': 0.403861,
         'VerticalAimingParams.elevationAngleDown': 0.403861
     };
     console.log('%c 悬稳+自瞄已启动', 'background: #000; color: #76FF33; font-size: 14px; font-weight: bold;');
     const TankCore = {
         runtimeHacks: {},
         init: function() {
             this.runScan();
             window.addEventListener('load', () => this.runScan());
             const interval = setInterval(() => {
                 const foundCount = Object.keys(this.runtimeHacks).length;
                 const targetCount = Object.keys(HACK_CONFIG).length;
                 if (foundCount >= targetCount) {
                     clearInterval(interval);
                     console.log('%c [TankHack] 已全部锁定', 'color: #76FF33');
                 } else {
                     this.runScan();
                 }
             }, 2000);
         },
         applyHook: function(obfName, targetKey, targetVal) {
             if (this.runtimeHacks[obfName]) return;
             this.runtimeHacks[obfName] = true;
             console.log(`%c锁定: ${targetKey}`, 'color: #00D4FF; font-weight: bold;');
             try {
                 Object.defineProperty(_win.Object.prototype, obfName, {
                     get: () => targetVal,
                     set: function() {},
                     enumerable: false,
                     configurable: true
                 });
             } catch (e) {}
         },
         fetchAndParseScripts: async function() {
             let codes = [];
             document.querySelectorAll('script:not([src])').forEach(s => codes.push(s.innerHTML));
             let scriptTags = document.querySelectorAll('script[src]');
             for(let s of scriptTags) {
                 if(s.src.includes('analytics') || s.src.includes('google') || s.src.includes('yandex')) continue;
                 try { codes.push(await (await fetch(s.src)).text()); } catch(e){}
             }
             let results = [];
             codes.forEach(code => {
                 const getterMap = {};
                 const getterRegex1 = /\.([A-Za-z0-9_$]+)\s*=\s*function\(\)\s*\{[^}]*?var\s+[A-Za-z0-9_$]+\s*=\s*this\.([A-Za-z0-9_$]+)\s*;/g;
                 const getterRegex2 = /\.([A-Za-z0-9_$]+)\s*=\s*function\(\)\s*\{\s*return\s+this\.([A-Za-z0-9_$]+)\s*;?\s*\}/g;
                 let gm;
                 while ((gm = getterRegex1.exec(code)) !== null) { getterMap[gm[1]] = gm[2]; }
                 while ((gm = getterRegex2.exec(code)) !== null) { getterMap[gm[1]] = gm[2]; }
                 const classRegex = /return\s*["']([A-Za-z0-9_$]+)\(([\s\S]*?)\)["']/g;
                 let match;
                 while ((match = classRegex.exec(code)) !== null) {
                     let cls = match[1];
                     let params = match[2];
                     const paramRegex = /([a-zA-Z0-9_$]+)\s*=\s*["']?\s*\+\s*(?:[a-zA-Z0-9_$]+\()?this\.([a-zA-Z0-9_$]+)/g;
                     let pMatch;
                     while((pMatch = paramRegex.exec(params)) !== null) {
                         let pName = pMatch[1];
                         let obf = pMatch[2];
                         if (getterMap[obf]) obf = getterMap[obf];
                         results.push({ cls: cls, pName: pName, obf: obf });
                     }
                 }
                 const toStringRegex = /\.toString\s*=\s*function\(\)\s*\{([\s\S]{1,4000}?)\}/g;
                 let tsMatch;
                 while ((tsMatch = toStringRegex.exec(code)) !== null) {
                     let funcBody = tsMatch[1];
                     let clsMatch = funcBody.match(/["']([A-Za-z0-9_$]+)\s*(?:\[|\()/);
                     if (!clsMatch) return;
                     let cls = clsMatch[1];
                     const paramRegex = /["']([a-zA-Z0-9_$]+)\s*=\s*["']\s*\+\s*(?:[a-zA-Z0-9_$]+\()?this\.([a-zA-Z0-9_$]+)/g;
                     let pMatch;
                     while((pMatch = paramRegex.exec(funcBody)) !== null) {
                         let pName = pMatch[1];
                         let obf = pMatch[2];
                         if (getterMap[obf]) obf = getterMap[obf];
                         results.push({ cls: cls, pName: pName, obf: obf });
                     }
                 }
             });
             return results;
         },
         runScan: async function() {
             const mappings = await this.fetchAndParseScripts();
             mappings.forEach(m => {
                 const fullKey = `${m.cls}.${m.pName}`;
                 if (HACK_CONFIG.hasOwnProperty(fullKey)) {
                     this.applyHook(m.obf, fullKey, HACK_CONFIG[fullKey]);
                 }
             });
         }
     };
     TankCore.init();
 })();

// ==UserScript==
// @name         悬浮底盘专用飞天穿墙（跑酷专用）
// @version      1.0
// @description  基于 v1.3.2 核心引擎的无界面版。强制锁定 tiltStabilityScale 和 halfSize。
// @match        *://*.3dtank.com/play*
// @match        *://*.tankionline.com/play*
// @match        *://*.test-eu.tankionline.com/browser-public/index.html*
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';

    const _win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    // --- 🎯 你的配置清单 ---
    // 只有写在这里的参数才会被修改
    const HACK_CONFIG = {
        'HoverChassisParams.tiltStabilityScale': 2147483647,  // 21亿 (飞天)
        'CollisionBox.halfSize': {}                           // 空对象 (穿墙)
    };

    console.log('%c 悬浮底盘飞天穿墙核心引擎启动 ', 'background: #000; color: #76FF33; font-size: 14px; font-weight: bold;');

    const TankCore = {
        runtimeHacks: {}, // 记录已经 Hook 过的混淆名

        init: function() {
            // 立即扫描一次
            this.runScan();
            // 页面加载完再扫一次
            window.addEventListener('load', () => this.runScan());
            // 防止脚本加载延迟，每秒检查一次，直到找到目标
            const interval = setInterval(() => {
                const foundCount = Object.keys(this.runtimeHacks).length;
                const targetCount = Object.keys(HACK_CONFIG).length;
                if (foundCount >= targetCount) {
                    clearInterval(interval);
                    console.log('%c [TankHack] 所有目标已锁定，停止扫描。', 'color: #76FF33');
                } else {
                    this.runScan();
                }
            }, 2000);
        },

        // --- 1. 核心 Hook 机制 (完全照搬 v1.3.3) ---
        applyHook: function(obfName, targetKey, targetVal) {
            if (this.runtimeHacks[obfName]) return; // 防止重复 Hook
            this.runtimeHacks[obfName] = true;

            console.log(`%c [TankHack] 锁定成功: ${targetKey} (混淆名: ${obfName}) => ${JSON.stringify(targetVal)}`, 'color: #00D4FF; font-weight: bold;');

            const instanceValues = new WeakMap(); // 存储原始值的容器

            // Getter: 永远返回我们要锁定的值 (targetVal)
            const getHandler = function() {
                // 如果你想看原始值是什么，可以在这里 console.log
                return targetVal;
            };

            // Setter: 假装允许写入，实际上写入到 instanceValues 里备用，但不影响 Getter 的返回值
            const setHandler = function(val) {
                instanceValues.set(this, val);
                // 可以在这里加逻辑：如果游戏试图改回原始值，我们什么都不做
            };

            try {
                Object.defineProperty(_win.Object.prototype, obfName, {
                    get: getHandler,
                    set: function(v) {
                        try {
                            Object.defineProperty(this, obfName, { get: getHandler, set: setHandler, enumerable: true, configurable: true });
                            this[obfName] = v; // 触发 setHandler
                        } catch (e) {
                            setHandler.call(this, v);
                        }
                    },
                    enumerable: false,
                    configurable: true
                });
            } catch (e) {
                console.warn("[TankHack] Hook 失败", obfName);
            }
        },

        // --- 2. 源码获取与解析 (完全照搬 v1.3.3) ---
        fetchAndParseScripts: async function() {
            let codes = [];
            // 获取内联脚本
            document.querySelectorAll('script:not([src])').forEach(s => codes.push(s.innerHTML));
            // 获取外链脚本
            let scriptTags = document.querySelectorAll('script[src]');
            for(let s of scriptTags) {
                if(s.src.includes('analytics') || s.src.includes('google') || s.src.includes('yandex')) continue;
                try { codes.push(await (await fetch(s.src)).text()); } catch(e){}
            }

            let results = [];

            codes.forEach(code => {
                // A. 构建 Getter 字典 (解决 this.tcx() 这种封装)
                const getterMap = {};
                const getterRegex1 = /\.([A-Za-z0-9_$]+)\s*=\s*function\(\)\s*\{[^}]*?var\s+[A-Za-z0-9_$]+\s*=\s*this\.([A-Za-z0-9_$]+)\s*;/g;
                const getterRegex2 = /\.([A-Za-z0-9_$]+)\s*=\s*function\(\)\s*\{\s*return\s+this\.([A-Za-z0-9_$]+)\s*;?\s*\}/g;

                let gm;
                while ((gm = getterRegex1.exec(code)) !== null) { getterMap[gm[1]] = gm[2]; }
                while ((gm = getterRegex2.exec(code)) !== null) { getterMap[gm[1]] = gm[2]; }

                // B. 匹配模式 1: 经典 return "Class(" + this.obf
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
                        if (getterMap[obf]) obf = getterMap[obf]; // 解包

                        results.push({ cls: cls, pName: pName, obf: obf });
                    }
                }

                // C. 匹配模式 2: 新版 toString (CollisionBox 就是这个模式)
                const toStringRegex = /\.toString\s*=\s*function\(\)\s*\{([\s\S]{1,4000}?)\}/g;
                let tsMatch;
                while ((tsMatch = toStringRegex.exec(code)) !== null) {
                    let funcBody = tsMatch[1];
                    let clsMatch = funcBody.match(/["']([A-Za-z0-9_$]+)\s*(?:\[|\()/);
                    if (!clsMatch) continue;
                    let cls = clsMatch[1];

                    const paramRegex = /["']([a-zA-Z0-9_$]+)\s*=\s*["']\s*\+\s*(?:[a-zA-Z0-9_$]+\()?this\.([a-zA-Z0-9_$]+)/g;
                    let pMatch;
                    while((pMatch = paramRegex.exec(funcBody)) !== null) {
                        let pName = pMatch[1];
                        let obf = pMatch[2];
                        if (getterMap[obf]) obf = getterMap[obf]; // 解包

                        results.push({ cls: cls, pName: pName, obf: obf });
                    }
                }
            });
            return results;
        },

        // --- 3. 扫描并匹配配置 ---
        runScan: async function() {
            const mappings = await this.fetchAndParseScripts();

            mappings.forEach(m => {
                // 组合键名: ClassName.ParamName
                const fullKey = `${m.cls}.${m.pName}`;

                // 检查这个参数是否在我们的 HACK_CONFIG 里
                if (HACK_CONFIG.hasOwnProperty(fullKey)) {
                    const targetVal = HACK_CONFIG[fullKey];
                    // 执行 Hook
                    this.applyHook(m.obf, fullKey, targetVal);
                }
            });
        }
    };

    TankCore.init();

})();

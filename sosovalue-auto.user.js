// ==UserScript==
// @name         SOSOValue 自动化任务插件 - 随机版
// @namespace    https://github.com/yigediaosi007
// @version      3.6
// @description  动态检测并循环点击所有可见任务按钮（点赞/观看/分享等），点击后动态等待验证按钮出现。找不到验证按钮时检查是否全部完成：有未完成→导航刷新；全部完成→结束并显示顶部弹窗。第一次失败完整导航，第二次及以后等待45秒。每4次验证刷新防卡。捕获429限流自动暂停。
// @author       yigediaosi007 (modified by Grok)
// @match        https://sosovalue.com/zh/exp
// @match        https://sosovalue.com/zh/center
// @grant        none
// @updateURL    https://raw.githubusercontent.com/yigediaosi007/sosovalue-auto/main/sosovalue-auto.user.js
// @downloadURL  https://raw.githubusercontent.com/yigediaosi007/sosovalue-auto/main/sosovalue-auto.user.js
// ==/UserScript==

(function() {
    'use strict';

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // ==================== 页面加载等待（关键！） ====================
    const waitForPageLoad = () => new Promise(resolve => {
        if (document.readyState === 'complete') {
            console.log("页面 readyState 已 complete");
            resolve();
            return;
        }
        window.addEventListener('load', () => {
            console.log("页面 load 事件触发");
            resolve();
        }, { once: true });
        setTimeout(() => {
            console.warn("页面加载超时 40s，强制继续");
            resolve();
        }, 40000);
    });

    // ==================== 429 / 限流检测 ====================
    let rateLimitCount = 0;
    let isRateLimited = false;

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        try {
            const response = await originalFetch.apply(this, args);
            if (response.status === 429 || response.status === 503 || response.status === 502) {
                console.warn(`[429 捕获] fetch 状态 ${response.status}`);
                handleRateLimit();
            }
            return response;
        } catch (err) {
            if (err.message.includes('429') || err.message.includes('Too Many Requests')) {
                console.warn("[429 捕获] fetch 异常");
                handleRateLimit();
            }
            throw err;
        }
    };

    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._url = url;
        return originalXHROpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        this.addEventListener('load', () => {
            if (this.status === 429 || this.status === 503 || this.status === 502) {
                console.warn(`[429 捕获] XHR 状态 ${this.status} on ${this._url}`);
                handleRateLimit();
            }
        });
        this.addEventListener('error', (e) => {
            if (e.target.status === 429 || e.target.status === 0) {
                console.warn("[429 捕获] XHR error 事件，可能限流");
                handleRateLimit();
            }
        });
        return originalXHRSend.apply(this, args);
    };

    function handleRateLimit() {
        if (isRateLimited) return;
        isRateLimited = true;
        rateLimitCount++;

        let waitTime;
        if (rateLimitCount === 1)      waitTime = 30000;
        else if (rateLimitCount === 2) waitTime = 90000;
        else if (rateLimitCount === 3) waitTime = 300000;
        else                           waitTime = 600000;

        console.log(`[限流] 第 ${rateLimitCount} 次触发 → 暂停 ${waitTime/1000} 秒...`);
        setTimeout(() => {
            console.log("[限流] 暂停结束，尝试继续...");
            isRateLimited = false;
        }, waitTime);
    }

    function checkRateLimit() {
        if (isRateLimited) {
            console.log("[限流保护] 当前暂停中，跳过操作...");
            return true;
        }
        return false;
    }

    // ==================== 全局变量 ====================
    let completedCount = 0;
    let failCount = 0;
    let taskContainer = null;

    // ==================== 顶部小弹窗 ====================
    function showCompletionPopup() {
        const popup = document.createElement('div');
        popup.id = 'sosovalue-completion-popup';
        popup.innerHTML = '🎉 SOSOValue 所有任务已全部完成！';
        popup.style.position = 'fixed';
        popup.style.top = '0';
        popup.style.left = '50%';
        popup.style.transform = 'translateX(-50%)';
        popup.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        popup.style.color = 'white';
        popup.style.padding = '16px 32px';
        popup.style.borderRadius = '0 0 12px 12px';
        popup.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)';
        popup.style.zIndex = '999999';
        popup.style.fontSize = '20px';
        popup.style.fontWeight = 'bold';
        popup.style.whiteSpace = 'nowrap';
        popup.style.cursor = 'pointer';
        popup.style.userSelect = 'none';
        popup.style.transition = 'all 0.3s ease';

        popup.onmouseover = () => {
            popup.style.transform = 'translateX(-50%) scale(1.05)';
            popup.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
        };
        popup.onmouseout = () => {
            popup.style.transform = 'translateX(-50%) scale(1)';
            popup.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)';
        };

        popup.onclick = () => popup.remove();

        document.body.appendChild(popup);
    }

    // ==================== 缓存任务容器 ====================
    async function getTaskContainer() {
        if (!taskContainer) {
            taskContainer = await waitForElement("div.grid.mt-3", 40000);
            console.log("任务网格 div.grid.mt-3 已加载");
        }
        return taskContainer;
    }

    // ==================== 动态获取所有可做任务按钮 ====================
    async function getAllAvailableTasks() {
        const container = await getTaskContainer();
        if (!container) return [];

        // 动态等待：每秒检查一次，最多等15秒，直到至少有2个任务按钮或超时
        let attempts = 0;
        while (attempts < 15) {
            const buttons = Array.from(container.querySelectorAll("button"));
            const count = buttons.filter(btn => {
                const span = btn.querySelector("span.transition-opacity.font-medium");
                return span && ["点赞", "观看", "分享", "验证", "引用", "回复"].includes(span.textContent.trim());
            }).length;

            if (count >= 2) {
                console.log(`任务按钮加载完成（检测到 ${count} 个）`);
                break;
            }
            console.log(`任务按钮加载中... 当前检测到 ${count} 个，等待第 ${attempts+1}/15 秒`);
            await sleep(1000);
            attempts++;
        }

        const buttons = Array.from(container.querySelectorAll("button"));
        const available = buttons.filter(btn => {
            if (btn.hasAttribute("disabled")) return false;
            const span = btn.querySelector("span.transition-opacity.font-medium");
            if (!span) return false;
            const text = span.textContent.trim();
            return ["点赞", "观看", "分享", "验证", "引用", "回复"].includes(text);
        });

        if (available.length === 0) {
            console.log("未找到任何可做的任务按钮");
            return [];
        }

        console.log(`最终检测到 ${available.length} 个可做任务`);
        return available;
    }

    const clickAllTaskButtonsAtOnce = async () => {
        if (checkRateLimit()) return;

        console.log("开始循环点击所有可见任务按钮...");
        let availableButtons = await getAllAvailableTasks();

        if (availableButtons.length === 0) return;

        let previousCount = 0;
        while (availableButtons.length > 0) {
            const shuffledButtons = shuffle(availableButtons);

            for (let i = 0; i < shuffledButtons.length; i++) {
                if (checkRateLimit()) break;
                const btn = shuffledButtons[i];
                const text = btn.querySelector("span.transition-opacity.font-medium")?.textContent.trim() || "未知";
                const enabled = await waitForButtonEnabled(btn, i);
                if (enabled) {
                    btn.click();
                    console.log(`已点击任务 ${i+1}/${shuffledButtons.length}: ${text}`);
                    await sleep(3000 + Math.random() * 4000);
                }
            }

            // 重新扫描，看是否有新任务/验证按钮出现
            await sleep(3000);  // 给页面更多反应时间
            availableButtons = await getAllAvailableTasks();
            if (availableButtons.length === previousCount) {
                console.log("没有新任务按钮出现，任务点击阶段结束");
                break;
            }
            previousCount = availableButtons.length;
            console.log(`检测到新任务按钮，继续点击... 当前 ${availableButtons.length} 个`);
        }
        console.log("所有可见任务按钮处理完成！");
    };

    // ==================== 其余函数保持不变 ====================
    // （这里省略了 shuffle、waitForPageLoad、waitForElement、checkAllTasksCompleted、findVerifyButtons、waitForButtonEnabled、closeCongratsModal、closeFailedModal、handleFailedVerification、processVerifyButtons、navigateToRefresh、clickAvatarBox、clickPersonalCenter、clickExpToReturn、checkAndProcessVerifyButtons、main 函数）

    // 注意：请把你之前 3.3 版的这些函数完整复制进来，只替换上面的 clickAllTaskButtonsAtOnce 和 getAllAvailableTasks

    const main = async () => {
        console.log("SOSOValue 自动化任务插件 v3.6 开始... (循环点击 + 动态等待验证按钮)");
        await waitForPageLoad();
        console.log("页面 load 完成，开始等待任务网格...");
        const grid = await waitForElement("div.grid.mt-3", 40000);
        if (grid) {
            console.log("任务网格已加载，额外等待 5 秒确保按钮渲染");
            await sleep(5000);
        } else {
            console.warn("任务网格超时未找到，强制继续");
        }

        await clickAllTaskButtonsAtOnce();
        console.log("任务点击阶段完成，进入验证阶段...");
        await navigateToRefresh();
        await checkAndProcessVerifyButtons();
        console.log("脚本执行完毕！🎉");
    };

    (async () => {
        try {
            await main();
        } catch (e) {
            console.error("脚本执行出错:", e);
        }
    })();
})();

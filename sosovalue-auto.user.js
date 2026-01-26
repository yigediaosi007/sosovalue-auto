// ==UserScript==
// @name         SOSOValue 自动化任务插件 - 随机版
// @namespace    https://github.com/yigediaosi007
// @version      3.6
// @description  动态检测所有任务。加强开头等待（页面加载 + 网格出现 + 额外缓冲），确保按钮全渲染。找不到验证按钮时检查是否全部完成：有未完成→导航刷新；全部完成→结束并显示顶部弹窗。第一次失败完整导航，第二次及以后等待45秒。每4次验证刷新防卡。捕获429限流自动暂停。
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
            taskContainer = await waitForElement("div.grid.mt-3", 30000);  // 等待30s，确保网格加载
            console.log("任务网格 div.grid.mt-3 已加载");
        }
        return taskContainer;
    }

    // ==================== 动态获取所有可做任务按钮 ====================
    async function getAllAvailableTasks() {
        const container = await getTaskContainer();
        if (!container) return [];

        // 额外等待 5 秒，确保所有任务盒子完全渲染
        console.log("额外等待 5 秒，确保任务按钮渲染完成...");
        await sleep(5000);

        const buttons = Array.from(container.querySelectorAll("button"));
        const available = buttons.filter(btn => {
            if (btn.hasAttribute("disabled")) return false;
            const span = btn.querySelector("span.transition-opacity.font-medium");
            if (!span) return false;
            const text = span.textContent.trim();
            // 精确匹配你提供的按钮文本
            return text === "点赞" || text === "观看" || text === "分享" || 
                   text === "引用" || text === "回复" || text === "验证";
        });

        if (available.length === 0) {
            console.log("未找到任何可做的任务按钮（可能已全部完成或加载失败）");
            return [];
        }

        console.log(`检测到 ${available.length} 个可做任务（动态检测）`);
        return available;
    }

    const clickAllTaskButtonsAtOnce = async () => {
        if (checkRateLimit()) return;

        console.log("开始随机点击所有可做任务按钮...");
        const availableButtons = await getAllAvailableTasks();

        if (availableButtons.length === 0) return;

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
        console.log("所有任务按钮随机点击完成！");
    };

    function shuffle(array) {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }

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
        // 兜底超时 40 秒强制继续
        setTimeout(() => {
            console.warn("页面加载超时 40s，强制继续（可能部分元素未加载）");
            resolve();
        }, 40000);
    });

    const waitForElement = async (selector, timeout = 30000, interval = 800) => {
        let elapsed = 0;
        while (elapsed < timeout) {
            const el = document.querySelector(selector);
            if (el) {
                console.log(`元素 ${selector} 已找到`);
                return el;
            }
            await sleep(interval);
            elapsed += interval;
        }
        console.warn(`超时未找到元素: ${selector}`);
        return null;
    };

    const checkAllTasksCompleted = () => {
        const buttons = Array.from(document.querySelectorAll("div.grid.mt-3 > button"));
        const completed = buttons.filter(btn =>
            btn.querySelector("span.transition-opacity.font-medium")?.textContent.trim() === "完成" &&
            btn.hasAttribute("disabled")
        );
        const totalButtons = buttons.length;
        console.log(`已完成任务数: ${completed.length} / 总任务数: ${totalButtons}`);
        return completed.length === totalButtons && totalButtons > 0;
    };

    const findVerifyButtons = async () => {
        let elapsed = 0;
        const maxWait = 12000;
        const interval = 1200;
        const container = await getTaskContainer();
        if (!container) return [];

        while (elapsed < maxWait) {
            if (checkRateLimit()) return [];
            const buttons = Array.from(container.querySelectorAll("button"));
            const verifyBtns = buttons.filter(btn => {
                const span = btn.querySelector("span.transition-opacity.font-medium");
                return span && span.textContent.trim() === "验证" && !btn.hasAttribute("disabled");
            });
            if (verifyBtns.length > 0) {
                console.log(`找到 ${verifyBtns.length} 个验证按钮`);
                return verifyBtns;
            }
            await sleep(interval);
            elapsed += interval;
        }
        console.log("未找到任何验证按钮（超时或全部完成）");
        return [];
    };

    const waitForButtonEnabled = async (btn, idx) => {
        let elapsed = 0;
        const maxWait = 10000;
        const interval = 1000;
        while (elapsed < maxWait) {
            if (!btn.disabled && btn.getAttribute("disabled") === null) return true;
            await sleep(interval);
            elapsed += interval;
        }
        console.log(`按钮 ${idx+1} 等待超时仍不可点`);
        return false;
    };

    const closeCongratsModal = async () => {
        for (let i = 0; i < 6; i++) {
            const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("我已了解"));
            if (btn) {
                btn.click();
                console.log("关闭“恭喜”弹窗");
                await sleep(2000);
                rateLimitCount = 0;
                return true;
            }
            await sleep(400);
        }
        return false;
    };

    const closeFailedModal = async () => {
        for (let i = 0; i < 8; i++) {
            let closeBtn = document.querySelector(
                'div.flex.justify-center.items-center.rounded-full.w-10.h-10.bg-neutral-bg-1-rest'
            );

            if (!closeBtn) {
                closeBtn = Array.from(document.querySelectorAll('div.rounded-full.w-10.h-10')).find(el =>
                    el.querySelector('svg path[stroke*="neutral-fg-1-rest"]') ||
                    el.innerHTML.includes('M1.83325 1.8335L11.1666 11.1668')
                );
            }

            if (closeBtn) {
                console.log("找到验证失败弹窗的 × 关闭按钮，正在点击关闭");
                closeBtn.click();
                await sleep(2000);
                return true;
            }

            await sleep(500);
        }
        console.warn("未找到 × 关闭按钮，尝试兜底点击 body");
        document.body.click();
        await sleep(2000);
        return false;
    };

    const handleFailedVerification = async () => {
        for (let i = 0; i < 10; i++) {
            const title = Array.from(document.querySelectorAll("h1, h2, .text-xl, .font-bold")).find(el =>
                el.textContent.includes("验证失败") || el.textContent.includes("失败")
            );

            if (title) {
                console.log("检测到“验证失败”标题");
                await closeFailedModal();
                return true;
            }

            await sleep(500);
        }
        return false;
    };

    const processVerifyButtons = async () => {
        if (checkRateLimit()) return false;

        let verifyBtns = await findVerifyButtons();
        if (verifyBtns.length === 0) return false;

        console.log(`准备批量点击 ${verifyBtns.length} 个验证按钮...`);

        const shuffled = shuffle(verifyBtns);
        for (let i = 0; i < shuffled.length; i++) {
            if (checkRateLimit()) break;
            const btn = shuffled[i];
            if (await waitForButtonEnabled(btn, i)) {
                btn.click();
                console.log(`点击验证 ${i+1}/${shuffled.length}`);
                await sleep(3500 + Math.random() * 4500);
            }
        }

        console.log("等待弹窗出现（约3-7秒）...");
        await sleep(3000 + Math.random() * 4000);

        const success = await closeCongratsModal();
        if (success) {
            completedCount += verifyBtns.length;
            console.log(`本轮验证成功，累计完成 ${completedCount} 个`);
            failCount = 0;
            rateLimitCount = 0;
            return true;
        }

        const isFailed = await handleFailedVerification();

        if (isFailed) {
            failCount++;
            console.log(`验证失败，第 ${failCount} 次`);

            if (failCount === 1) {
                console.log("第一次失败 → 关闭弹窗后完整导航刷新状态...");
                await navigateToRefresh();
                await sleep(3000);
            } else if (failCount >= 2) {
                console.log("连续失败2次以上 → 暂停45秒等待前端/服务器恢复...");
                await sleep(45000);
                failCount = 1;
            }

            console.log("失败弹窗已关闭，继续检测验证按钮是否可点击...");
        }

        return false;
    };

    const navigateToRefresh = async () => {
        if (checkRateLimit()) return;
        await clickAvatarBox();
        await sleep(900);
        await clickPersonalCenter();
        await sleep(1800);
        await clickExpToReturn();
        await sleep(2200);
    };

    const clickAvatarBox = async () => {
        let el = document.getElementById("go_profile");
        if (!el) {
            const selector = "button[aria-label='Open user menu'], div.MuiAvatar-root, .avatar, img.avatar, img.rounded-full, [aria-label*='avatar' i], [data-testid*='avatar'], div[role='button'] img";
            el = await waitForElement(selector, 12000);
        }
        if (el) {
            console.log("找到头像元素，正在点击");
            el.click();
        } else {
            console.error("未找到头像元素");
        }
    };

    const clickPersonalCenter = async () => {
        const items = Array.from(document.querySelectorAll("[role='menuitem'], a[href*='/zh/profile'], div.cursor-pointer, li.cursor-pointer"));
        const personalCenter = items.find(el =>
            el.textContent.trim().includes("个人资料") ||
            el.textContent.trim().includes("Profile")
        );
        if (personalCenter) {
            console.log("找到并点击 '个人资料' 菜单项");
            personalCenter.click();
        } else {
            console.warn("未找到‘个人资料’菜单项，尝试默认第2个");
            if (items.length >= 2) items[1].click();
        }
        await sleep(1200);
    };

    const clickExpToReturn = async () => {
        let el = document.getElementById("go_exp");
        if (!el) {
            el = await waitForElement(
                'div#go_exp, div.flex.items-center.cursor-pointer, span.text-base.mr-2.font-bold.text-transparent.whitespace-nowrap.bg-clip-text, [class*="bg-clip-text"]',
                10000,
                500
            );
        }

        if (el) {
            console.log("找到 EXP 入口，正在点击返回");
            el.click();
            await sleep(1500);
        } else {
            console.error("未找到 EXP 跳转元素");
        }
    };

    const checkAndProcessVerifyButtons = async () => {
        let verifyCount = 0;
        let retry = 0;
        while (true) {
            if (checkRateLimit()) {
                await sleep(5000);
                continue;
            }

            if (checkAllTasksCompleted()) {
                console.log("所有任务已完成，脚本结束");
                showCompletionPopup();
                break;
            }

            const verifyBtns = await findVerifyButtons();
            if (verifyBtns.length === 0) {
                console.log("未找到验证按钮，检查整体任务完成情况...");
                if (checkAllTasksCompleted()) {
                    console.log("所有任务已完成，无需继续，脚本结束");
                    showCompletionPopup();
                    break;
                } else {
                    console.log("还有未完成任务 → 执行一次完整导航刷新状态");
                    await navigateToRefresh();
                    await sleep(3000);
                    retry++;
                    if (retry >= 6) {
                        console.log("多次刷新仍未找到验证按钮且任务未全完成，停止脚本");
                        break;
                    }
                    continue;
                }
            }

            retry = 0;
            await processVerifyButtons();
            verifyCount += verifyBtns.length;

            if (verifyCount % 4 === 0 && verifyCount > 0) {
                console.log("每4次验证后刷新页面（防卡）...");
                await navigateToRefresh();
            }

            await sleep(5000 + Math.random() * 3000);
        }
    };

    const main = async () => {
        console.log("SOSOValue 自动化任务插件 v3.6 开始... (加强页面加载等待，确保任务全渲染)");
        // 加强开头等待
        await waitForPageLoad();
        console.log("页面 load 完成，开始等待任务网格...");
        const grid = await waitForElement("div.grid.mt-3", 40000);  // 等待40s，确保网格加载
        if (grid) {
            console.log("任务网格已加载，额外等待 5 秒确保按钮渲染");
            await sleep(5000);  // 额外 5s 缓冲
        } else {
            console.warn("任务网格超时未找到，强制继续（可能部分任务未加载）");
        }

        await clickAllTaskButtonsAtOnce();
        console.log("所有任务按钮已随机点击，等待页面更新...");
        await sleep(3500);
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

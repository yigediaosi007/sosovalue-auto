// ==UserScript==
// @name         SOSOValue 自动化任务插件 - 随机版
// @namespace    https://github.com/yigediaosi007
// @version      3.2
// @description  动态检测所有未完成任务。找不到验证按钮时检查是否全部完成：有未完成→导航刷新；全部完成→结束脚本并弹出提示弹窗。第一次失败完整导航，第二次及以后等待45秒。每4次验证刷新防卡。捕获429限流自动暂停。
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

    // ==================== 429 / 限流检测（fetch + XHR） ====================
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

    // ==================== 动态任务检测 ====================
    const supportedTaskKeywords = ["点赞", "观看", "分享", "引用", "回复", "点zan", "guan kan", "fen xiang"];

    async function getAllAvailableTasks() {
        const buttons = Array.from(document.querySelectorAll("div.grid.mt-3 > button"));
        const available = buttons.filter(btn => {
            if (btn.hasAttribute("disabled")) return false;
            const text = btn.querySelector("span.transition-opacity.font-medium")?.textContent || "";
            return supportedTaskKeywords.some(kw => text.includes(kw));
        });

        if (available.length === 0) {
            console.log("未找到任何可做的任务按钮");
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
            const text = btn.querySelector("span.transition-opacity.font-medium")?.textContent || "未知";
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
        if (document.readyState === 'complete') return resolve();
        window.addEventListener('load', resolve, { once: true });
    });

    const waitForElement = async (selector, timeout = 15000, interval = 500) => {
        let elapsed = 0;
        while (elapsed < timeout) {
            const el = document.querySelector(selector);
            if (el) return el;
            await sleep(interval);
            elapsed += interval;
        }
        throw new Error(`超时未找到: ${selector}`);
    };

    const checkAllTasksCompleted = () => {
        const buttons = Array.from(document.querySelectorAll("div.grid.mt-3 > button"));
        const completed = buttons.filter(btn =>
            btn.querySelector("span.transition-opacity.font-medium")?.textContent.includes("完成") &&
            btn.hasAttribute("disabled")
        );
        const totalButtons = buttons.length;
        console.log(`已完成任务数: ${completed.length} / 总任务数: ${totalButtons}`);
        return completed.length === totalButtons && totalButtons > 0;
    };

    const findVerifyButtons = async () => {
        let elapsed = 0;
        const maxWait = 15000, interval = 1000;
        while (elapsed < maxWait) {
            if (checkRateLimit()) return [];
            const buttons = Array.from(document.querySelectorAll("div.grid.mt-3 > button"));
            const verifyBtns = buttons.filter(btn =>
                btn.querySelector("span.transition-opacity.font-medium")?.textContent.includes("验证") &&
                !btn.hasAttribute("disabled")
            );
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
        while (elapsed < 12000) {
            if (!btn.disabled && btn.getAttribute("disabled") === null) return true;
            await sleep(1000);
            elapsed += 1000;
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

        console.log("等待弹窗出现（约4-10秒）...");
        await sleep(4000 + Math.random() * 6000);

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
        const selector = "div.MuiAvatar-root, .avatar, img.avatar, img.rounded-full, [aria-label*='avatar' i], [data-testid*='avatar'], div[role='button'] img, .profile-avatar";
        try {
            const el = await waitForElement(selector, 12000);
            console.log("找到头像元素，正在点击");
            el.click();
        } catch (e) {
            console.error("未找到头像元素:", e);
        }
    };

    const clickPersonalCenter = async () => {
        const items = Array.from(document.querySelectorAll("[role='menuitem'], div.cursor-pointer.p-4.hover\\:bg-gray-100, .menu-item, li.cursor-pointer"));
        const personalCenter = items.find(el =>
            el.textContent.trim().includes("个人中心") ||
            el.textContent.trim().includes("个人资料") ||
            el.textContent.trim().includes("Profile") ||
            el.textContent.trim().includes("Center")
        );
        if (personalCenter) {
            console.log("找到并点击 '个人中心' 菜单项");
            personalCenter.click();
        } else {
            console.warn("未找到‘个人中心’文本，尝试默认第2个菜单项");
            if (items.length >= 2) items[1].click();
        }
        await sleep(1200);
    };

    const clickExpToReturn = async () => {
        let el = document.getElementById("go_exp");

        if (!el) {
            const candidates = document.querySelectorAll('div, span');
            for (const candidate of candidates) {
                if (candidate.textContent.includes("Exp") && candidate.querySelector('img[src*="exps-dark.svg"]')) {
                    el = candidate;
                    break;
                }
            }
        }

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

            // 先检查是否全部完成
            if (checkAllTasksCompleted()) {
                console.log("所有任务已完成，脚本结束");
                alert("🎉 SOSOValue 所有任务已全部完成！\n你可以继续其他操作了～");
                break;
            }

            const verifyBtns = await findVerifyButtons();
            if (verifyBtns.length === 0) {
                console.log("未找到验证按钮，检查整体任务完成情况...");
                if (checkAllTasksCompleted()) {
                    console.log("所有任务已完成，无需继续，脚本结束");
                    alert("🎉 SOSOValue 所有任务已全部完成！\n你可以继续其他操作了～");
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

            await sleep(8000 + Math.random() * 4000);
        }
    };

    const main = async () => {
        console.log("SOSOValue 自动化任务插件 v3.1 开始... (动态任务 + 找不到验证按钮时智能检查完成度)");
        await sleep(1500);
        await clickAllTaskButtonsAtOnce();
        console.log("所有任务按钮已随机点击，等待页面更新...");
        await sleep(3500);
        await navigateToRefresh();
        await checkAndProcessVerifyButtons();
        console.log("脚本执行完毕！🎉");
    };

    (async () => {
        try {
            await waitForPageLoad();
            await waitForElement("div.grid.mt-3", 18000);
            await main();
        } catch (e) {
            console.error("脚本执行出错:", e);
        }
    })();
})();

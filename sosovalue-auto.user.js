// ==UserScript==
// @name         SOSOValue 自动化任务插件 - 随机版
// @namespace    https://github.com/yigediaosi007
// @version      2.5
// @description  5任务随机顺序：点赞×3、观看、分享。第一次验证失败→关闭弹窗→点击头像；第二次及以后失败→关闭弹窗→等待45秒再试（不刷新导航）。防429间隔拉长。
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

    const taskTypes = ["点赞", "点赞", "点赞", "观看", "分享"];
    let completedCount = 0;
    let failCount = 0;  // 连续验证失败次数

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
        console.log(`已完成任务数: ${completed.length}/5`);
        return completed.length >= 5;
    };

    const clickAllTaskButtonsAtOnce = async () => {
        console.log("开始随机点击全部 5 个任务按钮...");
        const buttons = Array.from(document.querySelectorAll("div.grid.mt-3 > button"));

        const availableButtons = buttons.filter(btn => {
            if (btn.hasAttribute("disabled")) return false;
            const text = btn.querySelector("span.transition-opacity.font-medium")?.textContent || "";
            return taskTypes.some(type => text.includes(type));
        });

        if (availableButtons.length === 0) {
            console.log("未找到任何可点击的任务按钮");
            return;
        }

        const shuffledButtons = shuffle(availableButtons);

        for (let i = 0; i < shuffledButtons.length; i++) {
            const btn = shuffledButtons[i];
            const text = btn.querySelector("span.transition-opacity.font-medium")?.textContent || "未知";
            const enabled = await waitForButtonEnabled(btn, i);
            if (enabled) {
                btn.click();
                console.log(`已点击任务 ${i+1}: ${text}`);
                await sleep(1500 + Math.random() * 2000);
            }
        }
        console.log("全部任务按钮随机点击完成！");
    };

    const findVerifyButtons = async () => {
        let elapsed = 0;
        const maxWait = 15000, interval = 800;
        while (elapsed < maxWait) {
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
        return [];
    };

    const waitForButtonEnabled = async (btn, idx) => {
        let elapsed = 0;
        while (elapsed < 12000) {
            if (!btn.disabled && btn.getAttribute("disabled") === null) return true;
            await sleep(800);
            elapsed += 800;
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
        let verifyBtns = await findVerifyButtons();
        if (verifyBtns.length === 0) return false;

        console.log(`准备批量点击 ${verifyBtns.length} 个验证按钮...`);

        const shuffled = shuffle(verifyBtns);
        for (let i = 0; i < shuffled.length; i++) {
            const btn = shuffled[i];
            if (await waitForButtonEnabled(btn, i)) {
                btn.click();
                console.log(`点击验证 ${i+1}/${shuffled.length}`);
                await sleep(2500 + Math.random() * 3500);
            }
        }

        console.log("等待弹窗出现（约4-10秒）...");
        await sleep(4000 + Math.random() * 6000);

        const success = await closeCongratsModal();
        if (success) {
            completedCount += verifyBtns.length;
            console.log(`本轮验证成功，累计完成 ${completedCount} 个`);
            failCount = 0;
            return true;
        }

        const isFailed = await handleFailedVerification();

        if (isFailed) {
            failCount++;
            console.log(`验证失败，第 ${failCount} 次`);

            if (failCount === 1) {
                // 第一次失败：关闭弹窗后点击头像（重新进入状态）
                console.log("第一次失败 → 关闭弹窗后点击头像重新进入...");
                await clickAvatarBox();  // 只点击头像，不完整导航
                await sleep(3000);       // 等待页面响应
            } else if (failCount >= 2) {
                // 第二次及以后：关闭弹窗 → 等待45秒 → 继续检测
                console.log("连续失败2次以上 → 暂停45秒等待前端/服务器恢复...");
                await sleep(45000);  // 45秒
                failCount = 1;       // 降为1，避免无限暂停
            }

            console.log("失败弹窗已关闭，继续检测验证按钮是否可点击...");
        }

        return false;
    };

    // 只点击头像（第一次失败时用）
    const clickAvatarBox = async () => {
        const selector = "div.MuiAvatar-root, .avatar, img.avatar, img.rounded-full, [aria-label*='avatar' i], [data-testid*='avatar'], div[role='button'] img, .profile-avatar";
        try {
            const el = await waitForElement(selector, 12000);
            console.log("找到头像元素，正在点击（第一次失败刷新状态）");
            el.click();
        } catch (e) {
            console.error("未找到头像元素:", e);
        }
    };

    // 完整导航函数（只在初始时用）
    const navigateToRefresh = async () => {
        await clickAvatarBox();
        await sleep(900);
        await clickPersonalCenter();
        await sleep(1800);
        await clickExpToReturn();
        await sleep(2200);
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
        while (!checkAllTasksCompleted()) {
            const verifyBtns = await findVerifyButtons();
            if (verifyBtns.length === 0) {
                retry++;
                if (retry >= 6) {
                    if (checkAllTasksCompleted()) break;
                    console.log("任务仍未全部完成，脚本停止");
                    break;
                }
                await sleep(8000);
                continue;
            }
            retry = 0;
            await processVerifyButtons();
            verifyCount += verifyBtns.length;

            if (verifyCount % 3 === 0 && verifyCount > 0) {
                console.log("每3次验证后刷新页面（可选防卡）...");
                await navigateToRefresh();
            }
            await sleep(1000);
        }
    };

    const main = async () => {
        console.log("SOSOValue 5任务随机自动化 v2.5 开始...");
        await sleep(1500);
        await clickAllTaskButtonsAtOnce();
        console.log("所有任务按钮已随机点击，等待页面更新...");
        await sleep(3500);
        await navigateToRefresh();
        await checkAndProcessVerifyButtons();
        console.log("所有 5 个任务已完成！🎉");
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

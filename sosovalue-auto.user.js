// ==UserScript==
// @name         SOSOValue 自动化任务插件
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  6任务顺序：点赞 点赞 访问 点赞 观看 分享。一开始一次性点击全部任务按钮，所有任务都需要验证，只等一个弹窗，验证失败点页面任意位置关闭，弹窗等待2秒，完成条件6个完成，任务完成时弹出alert提示。
// @author       Anonymous (modified by Grok)
// @match        https://sosovalue.com/zh/exp
// @match        https://sosovalue.com/zh/center
// @match        https://sosovalue.com/exp
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // 任务顺序（必须与页面一致）
    const taskButtonTexts = ["点赞", "点赞", "访问", "点赞", "观看", "分享"];
    let completedCount = 0;

    // 等待页面加载
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

    // 检查是否全部完成（6个“完成”按钮）
    const checkAllTasksCompleted = () => {
        const buttons = Array.from(document.querySelectorAll("div.grid.mt-3 > button"));
        const completed = buttons.filter(btn =>
            btn.querySelector("span.transition-opacity.font-medium")?.textContent.includes("完成") &&
            btn.hasAttribute("disabled")
        );
        console.log(`已完成任务数: ${completed.length}/6`);
        return completed.length >= 6;
    };

    // 一次性点击所有任务按钮（快速）
    const clickAllTaskButtonsAtOnce = async () => {
        console.log("开始一次性点击全部 6 个任务按钮...");
        const buttons = Array.from(document.querySelectorAll("div.grid.mt-3 > button"));
        const taskButtons = [];
        // 按顺序收集未禁用的按钮
        let likeCount = 0;
        for (const btn of buttons) {
            const text = btn.querySelector("span.transition-opacity.font-medium")?.textContent || "";
            if (!btn.hasAttribute("disabled")) {
                if (text.includes("点赞")) {
                    likeCount++;
                    if (likeCount <= 3) taskButtons.push(btn);
                } else if (text.includes("访问") || text.includes("观看") || text.includes("分享")) {
                    taskButtons.push(btn);
                }
            }
        }
        // 快速点击（500ms 间隔）
        for (let i = 0; i < taskButtons.length; i++) {
            const btn = taskButtons[i];
            const enabled = await waitForButtonEnabled(btn, i);
            if (enabled) {
                btn.click();
                console.log(`已点击任务 ${i+1}: ${taskButtonTexts[i] || '未知'}`);
                await sleep(500);
            }
        }
        console.log("全部任务按钮点击完成！");
    };

    // 查找所有可点的“验证”按钮
    const findVerifyButtons = async () => {
        let elapsed = 0;
        const maxWait = 15000, interval = 1000;
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
        while (elapsed < 15000) {
            if (!btn.disabled && btn.getAttribute("disabled") === null) return true;
            await sleep(1000);
            elapsed += 1000;
        }
        console.log(`按钮 ${idx+1} 等待超时仍不可点`);
        return false;
    };

    // 恭喜弹窗
    const closeCongratsModal = async () => {
        for (let i = 0; i < 4; i++) { // 2秒
            const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("我已了解"));
            if (btn) {
                btn.click();
                console.log("关闭“恭喜”弹窗");
                await sleep(2000);
                return true;
            }
            await sleep(500);
        }
        return false;
    };

    // 验证失败弹窗 → 点页面任意位置
    const handleFailedVerification = async () => {
        for (let i = 0; i < 4; i++) { // 2秒
            const h1 = Array.from(document.querySelectorAll("h1")).find(el => el.textContent.includes("验证失败"));
            if (h1) {
                console.log("检测到“验证失败”，点击页面关闭");
                document.body.click();
                await sleep(2000);
                return true;
            }
            await sleep(500);
        }
        return false;
    };

    // 一次性点击所有验证按钮 + 只等一个弹窗
    const processVerifyButtons = async () => {
        const verifyBtns = await findVerifyButtons();
        if (verifyBtns.length === 0) return false;
        console.log(`快速点击 ${verifyBtns.length} 个验证按钮...`);
        for (let i = 0; i < verifyBtns.length; i++) {
            const enabled = await waitForButtonEnabled(verifyBtns[i], i);
            if (enabled) {
                verifyBtns[i].click();
                await sleep(500);
            }
        }
        console.log("等待一个弹窗（2秒）...");
        await sleep(2000);
        const success = await closeCongratsModal();
        if (success) {
            completedCount += verifyBtns.length;
            console.log(`验证成功，已累计完成 ${completedCount} 个`);
            return true;
        }
        const failed = await handleFailedVerification();
        if (failed) console.log("验证失败，已关闭");
        else console.log("未检测到弹窗（可能手动关闭）");
        return false;
    };

    // 导航：头像 → 个人中心 → 返回
    const navigateToRefresh = async () => {
        await clickAvatarBox();
        await sleep(1000);
        await clickPersonalCenter();
        await sleep(2000);
        await clickExpToReturn();
        await sleep(2000);
    };

    const clickAvatarBox = async () => {
        const el = await waitForElement("div.MuiAvatar-root.MuiAvatar-circular.w-6.h-6.mui-style-3i9vrz, .avatar, img.avatar");
        el.click(); await sleep(1000);
    };

    const clickPersonalCenter = async () => {
        const items = document.querySelectorAll("[role='menuitem']");
        if (items.length >= 2) items[1].click();
    };

    const clickExpToReturn = async () => {
        const el = await waitForElement("span.text-base.mr-2.font-bold.text-transparent.whitespace-nowrap.bg-clip-text, a[href*='/zh/exp']");
        el.click();
    };

    // 主循环：验证 + 每5次刷新页面
    const checkAndProcessVerifyButtons = async () => {
        let verifyCount = 0;
        let retry = 0;
        while (!checkAllTasksCompleted()) {
            const verifyBtns = await findVerifyButtons();
            if (verifyBtns.length === 0) {
                retry++;
                if (retry >= 5) {
                    console.log("多次未找到验证按钮，检查完成状态...");
                    if (checkAllTasksCompleted()) break;
                    console.log("任务未完成，停止脚本");
                    break;
                }
                await sleep(10000);
                continue;
            }
            retry = 0;
            await processVerifyButtons();
            verifyCount += verifyBtns.length;
            if (verifyCount % 5 === 0) {
                console.log("每5次验证后刷新页面...");
                await navigateToRefresh();
            }
            await sleep(1000);
        }

        // 所有任务完成后弹出 alert
        if (checkAllTasksCompleted()) {
            console.log("所有 6 个任务已完成！");
            alert("✅所有任务已完成！");
        }
    };

    // 主流程
    const main = async () => {
        console.log("开始执行 6 任务自动化...");
        await sleep(2000);
        await clickAllTaskButtonsAtOnce();
        console.log("任务按钮已全部点击，等待 4 秒...");
        await sleep(4000);
        await navigateToRefresh(); // 第一次刷新确保页面更新
        await checkAndProcessVerifyButtons();
        console.log("脚本执行结束");
    };

    // 启动
    (async () => {
        try {
            await waitForPageLoad();
            await waitForElement("div.grid.mt-3", 15000);
            await main();
        } catch (e) {
            console.error("脚本错误:", e);
        }
    })();
})();

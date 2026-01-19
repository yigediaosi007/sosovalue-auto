// ==UserScript==
// @name         SOSOValue 自动化任务插件 - 随机版
// @namespace    https://github.com/yigediaosi007
// @version      2.0
// @description  5任务随机顺序：点赞×3、观看、分享。任务和验证按钮都随机点击，极速执行，每5次自动刷新防卡。
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
                await sleep(400 + Math.random() * 600);
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
        for (let i = 0; i < 5; i++) {
            const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("我已了解"));
            if (btn) {
                btn.click();
                console.log("关闭“恭喜”弹窗");
                await sleep(1800);
                return true;
            }
            await sleep(400);
        }
        return false;
    };

    const handleFailedVerification = async () => {
        for (let i = 0; i < 5; i++) {
            const h1 = Array.from(document.querySelectorAll("h1")).find(el => el.textContent.includes("验证失败"));
            if (h1) {
                console.log("检测到“验证失败”，点击页面关闭");
                document.body.click();
                await sleep(1800);
                return true;
            }
            await sleep(400);
        }
        return false;
    };

    const processVerifyButtons = async () => {
        let verifyBtns = await findVerifyButtons();
        if (verifyBtns.length === 0) return false;

        console.log(`随机点击 ${verifyBtns.length} 个验证按钮...`);
        const shuffledVerifyBtns = shuffle(verifyBtns);

        for (let i = 0; i < shuffledVerifyBtns.length; i++) {
            const btn = shuffledVerifyBtns[i];
            const enabled = await waitForButtonEnabled(btn, i);
            if (enabled) {
                btn.click();
                await sleep(400 + Math.random() * 500);
            }
        }

        console.log("等待弹窗出现（约2秒）...");
        await sleep(2200);

        const success = await closeCongratsModal();
        if (success) {
            completedCount += shuffledVerifyBtns.length;
            console.log(`验证成功，本轮完成 ${shuffledVerifyBtns.length} 个，累计 ${completedCount}`);
            return true;
        }

        const failed = await handleFailedVerification();
        if (failed) console.log("验证失败，已关闭弹窗");
        else console.log("未检测到明显弹窗");

        return false;
    };

    const navigateToRefresh = async () => {
        await clickAvatarBox();
        await sleep(900);
        await clickPersonalCenter();
        await sleep(1800);
        await clickExpToReturn();
        await sleep(2200);
    };

    const clickAvatarBox = async () => {
        const selector = "div.MuiAvatar-root.MuiAvatar-circular.w-6.h-6.mui-style-3i9vrz, .avatar, img.avatar, [aria-label*='avatar'], div[role='button'] img.rounded-full";
        const el = await waitForElement(selector, 10000);
        el.click();
    };

    const clickPersonalCenter = async () => {
        const items = document.querySelectorAll("[role='menuitem'], div.cursor-pointer.p-4.hover\\:bg-gray-100");
        if (items.length >= 2) {
            items[1].click();
        }
    };

    const clickExpToReturn = async () => {
        const selector = "a[href*='/zh/exp'], span.text-base.mr-2.font-bold, div.flex.items-center.cursor-pointer";
        const el = await waitForElement(selector, 10000);
        el.click();
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

            if (verifyCount % 5 === 0 && verifyCount > 0) {
                console.log("每5次验证后刷新页面...");
                await navigateToRefresh();
            }
            await sleep(800);
        }
    };

    const main = async () => {
        console.log("SOSOValue 5任务随机自动化 v2.0 开始...");
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

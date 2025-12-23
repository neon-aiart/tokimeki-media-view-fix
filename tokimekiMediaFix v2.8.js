// ==UserScript==
// @name         TOKIMEKI メディアスタイル修復
// @namespace    https://bsky.app/profile/neon-ai.art
// @homepage     https://bsky.app/profile/neon-ai.art
// @icon         data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌈</text></svg>
// @version      2.8
// @description  TOKIMEKIの「メディア」スタイルで投稿の本文や引用元をクリックした際に、その投稿の個別ページに移動できるようにします。また、キーボードショートカットでリアクション操作ができるようになります。
// @author       ねおん
// @match        https://tokimeki.blue/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @license      CC BY-NC 4.0
// ==/UserScript==

/**
 * ==============================================================================
 * IMPORTANT NOTICE / 重要事項
 * ==============================================================================
 * Copyright (c) 2024 ねおん (Neon)
 * Released under the CC BY-NC 4.0 License.
 * * [EN] Unauthorized re-uploading, modification of authorship, or removal of 
 * author credits is strictly prohibited. If you fork this project, you MUST 
 * retain the original credits.
 * * [JP] 無断転載、作者名の書き換え、およびクレジットの削除は固く禁じます。
 * 本スクリプトを改変・配布する場合は、必ず元の作者名（ねおん）を明記してください。
 * ==============================================================================
 */

(function() {
    'use strict';

    const VERSION = 'v2.8';
    const STORE_KEY = 'tokimeki_media_fix_shortcuts';

    // ========= 設定 =========
    let shortcuts = GM_getValue(STORE_KEY, {
        reply: 'Numpad1',
        repost: 'Numpad2',
        like: 'Numpad3',
        quote: 'Numpad4',
        bookmark: 'Numpad5',
        moderation: 'Numpad6'
    });

    // ========= クリックでポストを開く処理 (v1.4ベース) =========
    document.body.addEventListener('click', function(e) {
        // --- Step 0: 設定UIが開いている場合は何もしない ---
        if (document.querySelector('.tmf-overlay')) {
            return;
        }

        // --- Step 1: リンクやボタンなど、明確に除外する要素をクリックした場合は、即座に処理を終了する ---
        if (e.target.closest('a, button, .timeline-reaction, .timeline-image, .timeline-video-wrap')) {
            return;
        }

        // --- Step 2: テキストを選択中の場合は何もしない ---
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
            return;
        }

        // --- Step 3: クリックが投稿のコンテンツエリア内で行われたかを確認 ---
        const postContent = e.target.closest('.timeline__content');
        if (!postContent) {
            return;
        }

        // --- Step 4: その投稿が対象のコンテナ（メディアビュー or 引用一覧）内にあることを確認 ---
        if (!postContent.closest('div.media-content, div.v2-modal-contents')) {
            return;
        }

        // --- Step 5: 全てのチェックを通過した場合、atURIを取得してページを遷移させる ---
        const atUri = postContent.dataset.aturi;

        if (atUri && atUri.startsWith('at://') && atUri.includes('/app.bsky.feed.post/')) {
            const parts = atUri.replace('at://', '').split('/');
            const did = parts[0];
            const rkey = parts[2];
            const postUrl = `/profile/${did}/post/${rkey}`;

            // TOKIMEKI本体のイベントをキャンセルし、ページ移動を実行
            e.preventDefault();
            e.stopPropagation();
            window.location.href = postUrl;
        }
    }, true); // イベントキャプチャリングを使い、TOKIMEKIの処理より先にこのリスナーを実行

    // ========= キーボード操作 =========
    document.body.addEventListener('keydown', function(e) {
        // メディアビューが開いていない、または入力欄にフォーカスがある、設定画面が開いている場合は何もしない
        const dialog = document.querySelector('dialog.media-content-wrap[open]');
        const activeEl = document.activeElement;
        if (!dialog || (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) || document.querySelector('.tmf-overlay')) {
            return;
        }

        // 押されたキーに一致するアクションを探す
        const action = Object.keys(shortcuts).find(key => e.code === shortcuts[key]);

        // 複数画像操作（↑・↓）
        if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();

            // emblaコンポーネント（画像スライドショー全体）をダイアログ内から探す
            const emblaContainer = dialog.querySelector('.embla');

            if (emblaContainer) {
                let targetButton = null;

                if (e.code === 'ArrowUp') {
                    targetButton = emblaContainer.querySelector('.embla__prev');
                } else if (e.code === 'ArrowDown') {
                    targetButton = emblaContainer.querySelector('.embla__next');
                }

                if (targetButton) {
                    targetButton.click();

                    targetButton.style.transform = 'scale(1.2)';
                    setTimeout(() => {
                        targetButton.style.transform = '';
                    }, 150);
                    return;
                }
            }
        }

        if (!action) return;

        // イベントのデフォルト動作をキャンセル
        e.preventDefault();
        e.stopPropagation();

        // ダイアログ内の対応するボタンを探してクリック！
        const contentArea = dialog.querySelector('.media-content__content');
        if (!contentArea) return;

        // モデレーション操作
        if (action === 'moderation') {
            // 投稿全体（.media-content）を取得
            const postContainer = contentArea.closest('.media-content');
            if (!postContainer) return;

            // 警告コンテナ（「表示する」ボタンの親）と非表示化コンテナ（「隠す」ボタンの親）
            const warnContainer = postContainer.querySelector('.media-content__image .timeline-warn');
            const hidingContainer = postContainer.querySelector('.media-content__image .timeline-warn-hiding');

            let targetButton = null;

            // どちらのコンテナが現在「表示」されているかを判別する
            // TOKINMEKIの構造では、非表示のコンテナに 'display: none' などがつくため、
            // どちらのコンテナがアクティブ（表示されている）かを判定する。
            if (warnContainer && warnContainer.style.display !== 'none' && warnContainer.offsetParent !== null) {
                // 警告が表示されている状態（画像が隠されている状態）
                // warnContainer の中にあるボタン（「表示する」ボタン）を探す
                targetButton = warnContainer.querySelector('.timeline-warn-button button');
            } else if (hidingContainer && hidingContainer.style.display !== 'none' && hidingContainer.offsetParent !== null) {
                // 画像が表示されている状態（警告が隠されている状態）
                // hidingContainer の中にあるボタン（「隠す」ボタン）を探す
                targetButton = hidingContainer.querySelector('.timeline-warn-button button');
            }

            if (targetButton) {
                targetButton.click();
                // エフェクト
                targetButton.style.transform = 'scale(1.2)';
                setTimeout(() => {
                    targetButton.style.transform = '';
                }, 150);
            }
            return;
        }

        // リアクション操作
        const reactionAreas = contentArea.querySelectorAll('.timeline-reaction');
        if (reactionAreas.length === 0) return;
        const reactionArea = reactionAreas[reactionAreas.length - 1]; // 一番最後の要素がターゲットです✨

        let button;
        switch (action) {
            case 'reply':
                button = reactionArea.querySelector('.timeline-reaction__item--reply');
                break;
            case 'repost':
                button = reactionArea.querySelector('.timeline-reaction__item--repost');
                break;
            case 'like':
                button = reactionArea.querySelector('.timeline-reaction__item--like');
                break;
            case 'quote':
                button = reactionArea.querySelector('.timeline-reaction__item--quote');
                break;
            case 'bookmark':
                // ブックマークはボタンが入れ子になってるので注意です！
                button = reactionArea.querySelector('.timeline-reaction__item--bookmark');
                break;
        }

        if (button) {
            button.click();
            // いいねボタンとかは色がすぐ変わらないので、見た目でわかるようにちょっとエフェクトをつけます✨
            button.style.transform = 'scale(1.2)';
            setTimeout(() => {
                button.style.transform = '';
            }, 150);
        }
    }, true);

    // ========= 設定UI =========
    function ensureStyle() {
        if (document.getElementById('tmf-style')) return;
        const style = document.createElement('style');
        style.id = 'tmf-style';
        style.textContent = `
        :root { --tmf-bg-color: #1a1a1a; --tmf-text-color: #f0f0f0; --tmf-border-color: #333; --tmf-primary-color: #00a8ff; --tmf-primary-hover: #007bff; --tmf-secondary-color: #343a40; --tmf-modal-bg: #212529; --tmf-shadow: 0 8px 16px rgba(0, 0, 0, 0.5); --tmf-border-radius: 12px; }
        .tmf-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.7); z-index: 100000; display: flex; justify-content: center; align-items: center; }
        .tmf-panel { background-color: var(--tmf-modal-bg); color: var(--tmf-text-color); width: 90%; max-width: 480px; border-radius: var(--tmf-border-radius); box-shadow: var(--tmf-shadow); border: 1px solid var(--tmf-border-color); font-family: 'Inter', sans-serif; overflow: hidden; }
        .tmf-title { padding: 15px 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--tmf-border-color); font-size: 1.25rem; font-weight: 600; margin: 0; }
        .tmf-close { background: none; border: none; cursor: pointer; font-size: 24px; color: var(--tmf-text-color); opacity: 0.7; padding: 0; }
        .tmf-close:hover { opacity: 1; }
        .tmf-section { padding: 20px; }
        .tmf-shortcut-grid { display: grid; grid-template-columns: 150px 1fr; gap: 15px; align-items: center; }
        .tmf-label { font-size: 1rem; font-weight: 500; color: #e0e0e0; display: flex; align-items: center; gap: 8px; }
        .tmf-label svg { width: 20px; height: 20px; stroke: var(--tmf-text-color); }
        .tmf-input { width: 100%; padding: 8px 12px; background-color: var(--tmf-secondary-color); color: var(--tmf-text-color); border: 1px solid var(--tmf-border-color); border-radius: 6px; cursor: text; box-sizing: border-box; text-align: center; }
        .tmf-input.recording { border-color: var(--tmf-primary-color); box-shadow: 0 0 5px var(--tmf-primary-color); }
        .tmf-input.error { border-color: #e34959; }
        .tmf-bottom { padding: 15px 20px; border-top: 1px solid var(--tmf-border-color); display: flex; justify-content: space-between; align-items: center; }
        .tmf-bottom .tmf-version { font-size: 0.8rem; font-weight: 400; color: #aaa; }
        .tmf-button { padding: 10px 20px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; transition: all 0.2s ease; background-color: var(--tmf-primary-color); color: white; }
        .tmf-button:hover { background-color: var(--tmf-primary-hover); }
        `;
        document.head.appendChild(style);
    }

    function showToast(msg, isError = false) {
        const toast = document.createElement('div');
        toast.textContent = msg;
        toast.style.cssText = `
          position: fixed; bottom: 20px; left: 50%;
          transform: translateX(-50%);
          background: ${isError ? '#e34959' : 'var(--tmf-primary-color)'};
          color: white; padding: 10px 20px;
          border-radius: 6px;
          z-index: 100001;
          font-size: 14px;
          box-shadow: var(--tmf-shadow);
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function openSettings() {
        ensureStyle();
        if (document.querySelector('.tmf-overlay')) return;

        const overlay = document.createElement('div');
        overlay.className = 'tmf-overlay';
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

        const panel = document.createElement('div');
        panel.className = 'tmf-panel';

        panel.innerHTML = `
            <div class="tmf-title"><span>キー設定</span><button class="tmf-close">&times;</button></div>
            <div class="tmf-section"><div class="tmf-shortcut-grid">
                <label class="tmf-label" for="tmf-reply"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"></path></svg><span>コメント</span></label><input type="text" id="tmf-reply" class="tmf-input" readonly>
                <label class="tmf-label" for="tmf-repost"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"></path><path d="M3 11v-1a4 4 0 0 1 4-4h14"></path><path d="m7 22-4-4 4-4"></path><path d="M21 13v1a4 4 0 0 1-4 4H3"></path></svg><span>リポスト</span></label><input type="text" id="tmf-repost" class="tmf-input" readonly>
                <label class="tmf-label" for="tmf-like"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"></path></svg><span>いいね</span></label><input type="text" id="tmf-like" class="tmf-input" readonly>
                <label class="tmf-label" for="tmf-quote"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"></path><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"></path></svg><span>引用</span></label><input type="text" id="tmf-quote" class="tmf-input" readonly>
                <label class="tmf-label" for="tmf-bookmark"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path></svg><span>ブックマーク</span></label><input type="text" id="tmf-bookmark" class="tmf-input" readonly>
                <label class="tmf-label" for="tmf-moderation"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg><span>モデレーション</span></label><input type="text" id="tmf-moderation" class="tmf-input" readonly>
            </div></div>
            <div class="tmf-bottom"><span class="tmf-version">(${VERSION})</span><button class="tmf-button">保存</button></div>
        `;
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        const inputs = Object.fromEntries(
            Array.from(panel.querySelectorAll('.tmf-input')).map(input => [input.id.replace('tmf-', ''), input])
        );

        // 現在の設定値を表示
        for (const action in inputs) {
            inputs[action].value = shortcuts[action] || '';
        }

        let activeInput = null;

        const recordKey = (e, action) => {
            e.preventDefault();
            e.stopPropagation();

            // 全角入力チェック
            if (e.key.length > 1 && e.key !== 'Backspace' && e.key !== 'Delete' && !/F\d+/.test(e.key) ) {
                if (/[^ -~]/.test(e.key)) { // 半角ASCII文字以外
                     showToast('全角や修飾キーのみの入力はできません！', true);
                     return;
                }
            }

            // 他で使われてるキーかチェック
            const newCode = e.code;
            const otherInputs = Object.entries(inputs).filter(([act,]) => act !== action);
            if (otherInputs.some(([, inp]) => inp.value === newCode && !inp.classList.contains('recording'))) {
                inputs[action].classList.add('error');
                showToast('そのキーは他のアクションで使われています！', true);
                return;
            }

            inputs[action].value = newCode;
            inputs[action].classList.remove('recording', 'error');
            activeInput = null;
        };

        for (const action in inputs) {
            const input = inputs[action];
            input.addEventListener('click', () => {
                if (activeInput === input) {
                    input.classList.remove('recording');
                    activeInput = null;
                    return;
                }
                if(activeInput) activeInput.classList.remove('recording', 'error');

                activeInput = input;
                input.value = 'キーを押してください...';
                input.classList.add('recording');
                input.classList.remove('error');
            });
            input.addEventListener('keydown', (e) => recordKey(e, action));
        }

        panel.querySelector('.tmf-close').addEventListener('click', () => overlay.remove());
        panel.querySelector('.tmf-button').addEventListener('click', () => {
            const newShortcuts = {};
            let hasError = false;
            for (const action in inputs) {
                const val = inputs[action].value;
                if (!val || val.includes('...')) {
                    showToast(`${action} のキーが設定されていません！`, true);
                    hasError = true;
                    break;
                }
                newShortcuts[action] = val;
            }

            if (!hasError) {
                shortcuts = newShortcuts;
                GM_setValue(STORE_KEY, shortcuts);
                showToast('設定を保存しました！');
                overlay.remove();
            }
        });
    }

    GM_registerMenuCommand('キー設定', openSettings);

})();

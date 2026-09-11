from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
from pathlib import Path

from patchright.async_api import Page, async_playwright


def browser_launch_options(headless: bool) -> dict:
    """Prefer the installed Chrome so visible platform workflows share a stable browser runtime.

    中文：优先使用已安装的 Chrome，避免依赖可能缺失的内置 Chromium。
    """
    candidates = [
        os.environ.get("LOCAL_CHROME_PATH", ""),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]
    executable = next((item for item in candidates if item and Path(item).is_file()), None)
    options: dict = {"headless": headless}
    if executable:
        options["executable_path"] = executable
    else:
        options["channel"] = "chromium"
    if not headless:
        options["args"] = ["--no-sandbox", "--disable-blink-features=AutomationControlled"]
    return options


def load_cookies(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return [
        {
            "name": item["name"],
            "value": item["value"],
            "domain": ".bilibili.com",
            "path": "/",
            "expires": float(item.get("expires", -1)),
            "httpOnly": bool(item.get("http_only", 0)),
            "secure": bool(item.get("secure", 0)),
            "sameSite": "Lax",
        }
        for item in data["cookie_info"]["cookies"]
    ]


def resolve_task_path(task_root: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else task_root / path


async def dump_form(page: Page, qa_dir: Path) -> None:
    await page.screenshot(path=str(qa_dir / "B站投稿表单-待填写.png"), full_page=True)
    controls = await page.locator(
        "input, textarea, [contenteditable='true'], button"
    ).evaluate_all(
        """elements => elements.map((e, index) => ({
            index,
            tag: e.tagName,
            type: e.getAttribute('type'),
            accept: e.getAttribute('accept'),
            placeholder: e.getAttribute('placeholder'),
            text: (e.innerText || e.value || '').trim(),
            aria: e.getAttribute('aria-label'),
            cls: e.className
        }))"""
    )
    (qa_dir / "B站投稿表单-控件.json").write_text(
        json.dumps(controls, ensure_ascii=False, indent=2), encoding="utf-8"
    )


async def fill_form(
    page: Page,
    title: str,
    description: str,
    tags: list[str],
    thumbnail: Path,
    qa_dir: Path,
    close_cover_editor: bool = True,
) -> None:
    # 中文：只填写表单并保存草稿，不点击立即投稿。
    # English: Fill the form and save a draft without submitting the work.
    title_input = page.locator(
        "input[placeholder*='稿件标题'], input[placeholder*='标题']"
    ).first
    await title_input.wait_for(state="visible", timeout=60_000)
    await title_input.fill(title)

    description_box = page.locator(
        "textarea[placeholder*='简介'], textarea[placeholder*='信息'], "
        "[contenteditable='true'][data-placeholder*='简介'], .ql-editor[contenteditable='true']"
    ).first
    if await description_box.count() and await description_box.is_visible():
        await description_box.click()
        await page.keyboard.press("Control+A")
        await page.keyboard.type(description)

    # 中文：B站当前的“创作声明”是内容标注；真人原片选择“内容无需标注”，不勾选 AI 生成声明。
    # English: Bilibili's current declaration is a content label; natural talking-head footage uses “no label required”.
    declaration_input = page.locator("input[placeholder*='创作声明']").first
    if await declaration_input.count() and await declaration_input.is_visible():
        await declaration_input.click()
        await page.wait_for_timeout(300)
        selected = False
        declaration_options = page.locator(
            "li.bcc-option, [role='option'], [class*='select-option'], "
            "[class*='SelectOption'], [class*='option-item'], [class*='optionItem']"
        )
        observed_options: list[dict] = []
        for index in range(await declaration_options.count()):
            option = declaration_options.nth(index)
            option_text = (await option.inner_text()).strip()
            is_visible = await option.is_visible()
            observed_options.append(
                {"index": index, "text": option_text, "visible": is_visible}
            )
            normalized_text = re.sub(r"\s+", "", option_text)
            if normalized_text == "内容无需标注":
                # 中文：仅在内容标注下拉项中点击，避免误选到页面的其他相似提示文字。
                # English: Click only the matching entry in the declaration menu, never unrelated page text.
                await option.evaluate("element => element.click()")
                selected = True
                break
        if not selected:
            (qa_dir / "B站创作声明-候选.json").write_text(
                json.dumps(observed_options, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            await page.screenshot(path=str(qa_dir / "B站创作声明-无法识别.png"), full_page=True)
            raise RuntimeError("B站要求选择创作声明，但未找到‘内容无需标注’选项")

    tag_input = page.locator(
        "input[placeholder*='标签'], input[placeholder*='Enter']"
    ).first
    if await tag_input.count() and await tag_input.is_visible():
        for tag in tags:
            await tag_input.fill(tag)
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(300)

    await upload_cover(
        page,
        thumbnail,
        qa_dir=qa_dir,
        require_close=close_cover_editor,
    )


async def upload_cover(
    page: Page,
    thumbnail: Path,
    qa_dir: Path,
    require_close: bool = True,
) -> None:
    # 中文：B站只有打开封面编辑器后才创建图片上传控件。
    # English: Bilibili creates the image input only after opening the cover editor.
    add_cover = page.get_by_text("添加封面", exact=True).first
    await add_cover.wait_for(state="visible", timeout=60_000)
    await add_cover.click()
    await page.wait_for_timeout(1_500)

    # 中文：新版 B 站同时要求 4:3 与 16:9 预览；开启同步后一次上传即可覆盖两种比例。
    # English: Current Bilibili expects both 4:3 and 16:9 previews; sync lets one upload drive both crops.
    sync_label = page.get_by_text("双比例同步改动", exact=False).first
    if await sync_label.count() and await sync_label.is_visible():
        sync_area = sync_label.locator("xpath=..")
        checkbox = sync_area.locator("input[type='checkbox']").first
        if await checkbox.count():
            if not await checkbox.is_checked():
                await sync_label.click()
        else:
            await sync_label.click()
        await page.wait_for_timeout(800)

    uploaded = False
    for label in ("上传封面", "上传图片", "本地上传"):
        candidate = page.get_by_text(label, exact=False).first
        if await candidate.count() and await candidate.is_visible():
            # 中文：新版 B 站通过浏览器 FileChooser 选择图片，不再保留可定位的图片 input。
            # English: The current Bilibili editor emits FileChooser without keeping a locatable image input.
            try:
                async with page.expect_file_chooser(timeout=5_000) as chooser_info:
                    await candidate.click()
                chooser = await chooser_info.value
                await chooser.set_files(str(thumbnail))
                uploaded = True
                break
            except Exception:
                await page.wait_for_timeout(500)

    if not uploaded:
        image_inputs = page.locator(
            "input[type=file][accept*='image'], input[type=file][accept*='.jpg'], "
            "input[type=file][accept*='.png']"
        )
        if await image_inputs.count():
            await image_inputs.last.set_input_files(str(thumbnail))
            uploaded = True

    if not uploaded:
        raise RuntimeError("封面编辑器已打开，但没有捕获到图片选择控件")

    await page.wait_for_timeout(3_000)
    if not require_close:
        # 中文：用户要求页面就地保留时，封面进入预览后不再确认、保存或投稿。
        # English: In leave-open mode, stop once the cover reaches preview; do not confirm, save, or submit.
        return

    async def cover_editor():
        """Return the active cover modal using a single live-DOM query.

        中文：封面确认会立刻重建 DOM；一次页面查询避免遍历旧 Locator 快照而卡住。
        English: Cover confirmation rebuilds the DOM immediately; one live query avoids stale Locator snapshots.
        """
        found = await page.evaluate(
            """() => {
                document.querySelectorAll("[data-codex-cover-editor='active']")
                    .forEach((element) => element.removeAttribute("data-codex-cover-editor"));
                const visible = (element) => {
                    if (!(element instanceof HTMLElement)) return false;
                    const rect = element.getBoundingClientRect();
                    const style = getComputedStyle(element);
                    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
                };
                const markers = ["首页推荐封面", "个人空间封面", "智能生成封面"];
                const candidates = [...document.querySelectorAll(
                    "[role='dialog'], .bcc-dialog, [class*='dialog'], [class*='modal'], [class*='cover']"
                )]
                    .filter(visible)
                    .filter((element) => markers.some((marker) => (element.innerText || '').includes(marker)));
                const target = candidates
                    .sort((left, right) => {
                        const leftRect = left.getBoundingClientRect();
                        const rightRect = right.getBoundingClientRect();
                        return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
                    })[0];
                if (!target) return false;
                target.setAttribute("data-codex-cover-editor", "active");
                return true;
            }"""
        )
        return page.locator("[data-codex-cover-editor='active']").first if found else None

    async def editor_is_open() -> bool:
        """Detect the visible cover editor. 检测当前是否仍停留在封面编辑器。"""
        return await cover_editor() is not None

    # 中文：双比例封面上传后会先进入“制作中”，只有封面浮层自己的 submit 按钮解除禁用后才能确认。
    # English: Dual-ratio covers enter a processing state; confirm only after the cover modal's own submit control is enabled.
    cover_submit = page.locator(
        ".cover-editor-button .button.submit:not(.submit-disabled), "
        ".cover-editor-content-right-bottom .button.submit:not(.submit-disabled)"
    ).last
    try:
        await cover_submit.wait_for(state="visible", timeout=120_000)
        await cover_submit.evaluate("element => element.click()")
        await page.wait_for_timeout(2_000)
        if not await editor_is_open():
            return
    except Exception:
        # 中文：旧版或非标准封面编辑器没有该类名时，继续走下方受限的兼容分支。
        # English: Older/non-standard editors may lack this class; fall through to the scoped compatibility path.
        pass

    # 中文：只在封面弹层内找确认按钮，绝不扫描或点击投稿页的同名按钮。
    # English: Search confirmation controls only inside the cover modal, never in the publish page.
    for label in ("完成", "确认", "确定", "裁剪完成", "保存"):
        editor = await cover_editor()
        if editor is None:
            return
        buttons = editor.locator(
            "button, [role='button'], .bcc-button, [class*='button'], [class*='btn']"
        )
        for index in range(await buttons.count() - 1, -1, -1):
            button = buttons.nth(index)
            if not await button.is_visible():
                continue
            button_text = (await button.inner_text()).strip()
            if button_text != label:
                continue
            await button.evaluate("element => element.click()")
            await page.wait_for_timeout(2_000)
            if not await editor_is_open():
                return

    # 中文：少数版本的底部主按钮没有文字；仅限弹层内的 primary 按钮，且明确排除投稿动作。
    # English: Some versions expose an unlabeled primary action; limit it to the modal and exclude publishing actions.
    editor = await cover_editor()
    if editor is not None:
        clicked = await editor.evaluate(
            """root => {
                const visible = (element) => {
                    const rect = element.getBoundingClientRect();
                    const style = getComputedStyle(element);
                    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
                };
                const candidates = [...root.querySelectorAll(
                    "button.bcc-button--primary, .bcc-button--primary, " +
                    "[class*='button'][class*='primary'], [class*='btn'][class*='primary']"
                )]
                    .filter(visible)
                    .filter((element) => !/(投稿|发布)/.test(element.innerText || ''));
                const target = candidates.at(-1);
                if (!target) return false;
                target.click();
                return true;
            }"""
        )
        if clicked:
            await page.wait_for_timeout(2_000)
            if not await editor_is_open():
                return

    # 中文：为后续适配保留真实页面证据；此时不会保存草稿，更不会投稿。
    # English: Preserve live UI evidence for the next compatibility update; no draft is saved or submitted here.
    editor = await cover_editor()
    if editor is not None:
        await page.screenshot(path=str(qa_dir / "B站封面编辑器-无法确认.png"), full_page=True)
        controls = await editor.locator(
            "button, [role='button'], input, label, [class*='button'], [class*='btn']"
        ).evaluate_all(
            """elements => elements.map((element, index) => ({
                index,
                tag: element.tagName,
                text: (element.innerText || element.value || '').trim(),
                className: element.className,
                aria: element.getAttribute('aria-label')
            }))"""
        )
        (qa_dir / "B站封面编辑器-控件.json").write_text(
            json.dumps(controls, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        page_controls = await page.locator(
            "button, [role='button'], [class*='button'], [class*='btn']"
        ).evaluate_all(
            """elements => elements.map((element, index) => {
                const rect = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                return {
                    index,
                    text: (element.innerText || element.getAttribute('aria-label') || '').trim(),
                    className: element.className,
                    visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
                    x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height),
                    zIndex: style.zIndex
                };
            })"""
        )
        (qa_dir / "B站封面编辑器-页面控件.json").write_text(
            json.dumps(page_controls, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    raise RuntimeError("封面图片已上传，但没有找到可确认的封面状态")


async def wait_for_upload_complete(page: Page, timeout_seconds: int = 900) -> None:
    # 中文：保存草稿前等待视频真正上传完，避免临时草稿随浏览器关闭而丢失。
    # English: Wait for the upload to finish before saving so the draft persists.
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout_seconds
    last_progress = ""
    while loop.time() < deadline:
        body = await page.locator("body").inner_text()
        if "稿件投递成功" in body:
            # 中文：平台若在未授权情况下自行创建稿件，立即进入技术暂停并保留现场。
            # English: If the platform creates a submission without authorization, pause immediately and preserve the page.
            raise RuntimeError("检测到平台在未点击投稿按钮时显示‘稿件投递成功’")
        progress_values = re.findall(r"(?<!\d)(\d{1,3})%", body)
        if progress_values:
            last_progress = progress_values[0] + "%"
        # 中文：页面其他区域也会出现“上传完成”文案，必须以当前视频卡片的已上传/总大小为准。
        # English: Other page areas can contain “upload complete”; rely on the active video's uploaded/total size.
        size_pairs = re.findall(
            r"已上传[：:]\s*([\d.]+)\s*(?:MB|M)\s*/\s*([\d.]+)\s*(?:MB|M)",
            body,
            flags=re.IGNORECASE,
        )
        completed_by_size = any(
            float(uploaded) >= float(total) - 0.05
            for uploaded, total in size_pairs
            if float(total) > 0
        )
        if completed_by_size or ("100%" in body and not size_pairs):
            await page.wait_for_timeout(5_000)
            print("BILIBILI_UPLOAD_COMPLETED=1", flush=True)
            return
        await page.wait_for_timeout(2_000)
    raise TimeoutError(f"等待B站视频上传完成超时，最后进度：{last_progress or '未知'}")


async def verify_draft(page: Page, title: str) -> bool:
    await page.goto(
        "https://member.bilibili.com/platform/upload-manager/article?group=draft&page=1",
        wait_until="domcontentloaded",
        timeout=90_000,
    )
    await page.wait_for_timeout(8_000)
    draft_tab = page.get_by_text("草稿", exact=True).first
    if await draft_tab.count() and await draft_tab.is_visible():
        await draft_tab.click()
        await page.wait_for_timeout(5_000)
    body = await page.locator("body").inner_text()
    return title in body


async def verify_only(args: argparse.Namespace) -> None:
    manifest = json.loads(args.manifest.resolve().read_text(encoding="utf-8-sig"))
    title = manifest["copy"]["title"]
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(**browser_launch_options(headless=True))
        context = await browser.new_context(permissions=["notifications"])
        await context.add_cookies(load_cookies(args.cookie.resolve()))
        page = await context.new_page()
        found = await verify_draft(page, title)
        print(f"BILIBILI_DRAFT_FOUND={1 if found else 0}", flush=True)
        await context.close()
        await browser.close()


async def prepare(args: argparse.Namespace) -> None:
    manifest_path = args.manifest.resolve()
    task_root = manifest_path.parent.parent
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    video = resolve_task_path(task_root, manifest["media"]["video"]).resolve()
    thumbnail = resolve_task_path(task_root, manifest["media"]["thumbnail"]).resolve()
    title = manifest["copy"]["title"]
    description = manifest["copy"]["description"]
    tags = list(manifest["copy"]["tags"])
    qa_dir = args.qa_dir.resolve()
    qa_dir.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(**browser_launch_options(headless=False))
        # 中文：预授予通知权限，避免首次进入投稿页的浏览器原生弹窗遮挡表单。
        # English: Pre-grant notifications so a native first-visit prompt cannot block the upload form.
        context = await browser.new_context(permissions=["notifications"])
        await context.add_cookies(load_cookies(args.cookie.resolve()))
        page = await context.new_page()
        await page.goto(
            "https://member.bilibili.com/platform/upload/video/frame",
            wait_until="domcontentloaded",
            timeout=90_000,
        )
        await page.wait_for_timeout(5_000)
        # 中文：首次进入投稿页的通知引导会遮挡表单，先关闭，不处理浏览器原生授权弹窗。
        # English: Dismiss the page-level notification guide that obscures the form; native browser prompts are untouched.
        notice = page.get_by_text("知道了", exact=True).last
        if await notice.count() and await notice.is_visible():
            await notice.click(force=True)
            await page.wait_for_timeout(1_000)
        video_input = page.locator(
            "input[type=file][accept*='.mp4']"
        ).first
        await video_input.set_input_files(str(video))
        print("BILIBILI_UPLOAD_STARTED=1", flush=True)

        title_input = page.locator(
            "input[placeholder*='稿件标题'], input[placeholder*='标题']"
        ).first
        await title_input.wait_for(state="visible", timeout=600_000)
        await page.wait_for_timeout(3_000)
        await dump_form(page, qa_dir)
        print("BILIBILI_FORM_READY=1", flush=True)

        try:
            command = (await asyncio.to_thread(input)).strip().lower()
            if command != "fill":
                raise RuntimeError("未收到 fill 指令，已停止且没有提交稿件")
            await fill_form(
                page,
                title,
                description,
                tags,
                thumbnail,
                qa_dir,
                close_cover_editor=not args.leave_open,
            )
            await page.screenshot(path=str(qa_dir / "B站投稿表单-已填写.png"), full_page=True)
            print("BILIBILI_FORM_FILLED=1", flush=True)

            await wait_for_upload_complete(page)
            await page.screenshot(path=str(qa_dir / "B站投稿表单-上传完成.png"), full_page=True)

            if args.leave_open:
                print("BILIBILI_PAGE_READY=1", flush=True)
                # 中文：保持浏览器和未保存页面原样打开，直到用户自行关闭。
                # English: Keep the unsaved browser page untouched until the user closes it.
                await asyncio.to_thread(input)
                return

            command = (await asyncio.to_thread(input)).strip().lower()
            if command != "save":
                raise RuntimeError("未收到 save 指令，未保存或提交稿件")
            draft_button = page.get_by_role("button", name="存草稿", exact=True).first
            if not await draft_button.count():
                draft_button = page.get_by_text("存草稿", exact=True).first
            await draft_button.wait_for(state="visible", timeout=30_000)
            await draft_button.click(force=True)
            await page.wait_for_timeout(2_000)
            finish_after_save = page.get_by_text("完成", exact=True).last
            if await finish_after_save.count():
                await finish_after_save.evaluate("element => element.click()")
                await page.wait_for_timeout(2_000)
                await draft_button.click(force=True)
            await page.wait_for_timeout(8_000)
            await page.screenshot(path=str(qa_dir / "B站草稿-保存结果.png"), full_page=True)
            if not await verify_draft(page, title):
                await page.screenshot(path=str(qa_dir / "B站草稿-二次核验失败.png"), full_page=True)
                raise RuntimeError("B站草稿保存后未在草稿列表中找到，不能判定为完成")
            await page.screenshot(path=str(qa_dir / "B站草稿-二次核验通过.png"), full_page=True)
            print("BILIBILI_DRAFT_SAVED=1", flush=True)
            await context.storage_state(path=str(qa_dir / "B站浏览器状态.json"))
            await page.wait_for_timeout(2_000)
            await context.close()
            await browser.close()
        except Exception as error:
            # 中文：技术异常只记录并停在当前浏览器，不退出、不重传、更不投稿。
            # English: On technical errors, record and hold the current browser; never exit, re-upload, or publish.
            await page.screenshot(path=str(qa_dir / "B站投稿表单-技术暂停.png"), full_page=True)
            (qa_dir / "B站技术暂停原因.txt").write_text(
                f"{type(error).__name__}: {error}\n", encoding="utf-8"
            )
            print("BILIBILI_PAGE_PAUSED=1", flush=True)
            print(f"BILIBILI_PAUSE_REASON={type(error).__name__}", flush=True)
            # 中文：维持可见浏览器供用户检查或手动处理；收到终端输入前不关闭。
            # English: Keep the visible browser available for inspection/manual handling until terminal input arrives.
            await asyncio.to_thread(input)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--cookie", required=True, type=Path)
    parser.add_argument("--qa-dir", required=True, type=Path)
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--leave-open", action="store_true")
    args = parser.parse_args()
    asyncio.run(verify_only(args) if args.verify_only else prepare(args))


if __name__ == "__main__":
    main()

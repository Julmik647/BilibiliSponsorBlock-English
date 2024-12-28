import Config from "../config";
import { getVideoLabel } from "../requests/videoLabels";
import { waitFor } from "../utils/";
import { getBvIDFromURL } from "../utils/parseVideoID";

export async function labelThumbnails(thumbnails: HTMLElement[]): Promise<void> {
    await Promise.all(thumbnails.map((t) => labelThumbnail(t as HTMLImageElement)));
}

export async function labelThumbnail(
    thumbnail: HTMLImageElement,
    thumbnailOldHref?: string
): Promise<HTMLElement | null> {
    if (!Config.config?.fullVideoSegments || !Config.config?.fullVideoLabelsOnThumbnails) {
        hideThumbnailLabel(thumbnail);
        return null;
    }

    // find all links in the thumbnail, reduce to only one video ID
    const links = Array.from(thumbnail.querySelectorAll("a[href]")) as Array<HTMLAnchorElement>;
    const videoIDs = new Set(
        (await Promise.allSettled(links.filter((link) => link && link.href).map((link) => getBvIDFromURL(link.href))))
            .filter((result) => result.status === "fulfilled")
            .map((result) => result.value)
            .filter((id) => !!id)
    );
    if (videoIDs.size !== 1) {
        // none or multiple video IDs found
        hideThumbnailLabel(thumbnail);
        return null;
    }
    const [videoID] = videoIDs;

    const category = await getVideoLabel(videoID);
    if (!category) {
        hideThumbnailLabel(thumbnail);
        return null;
    }

    // 获取或创建缩略图标签
    const { overlay, text } = await createOrGetThumbnail(thumbnail);

    if (thumbnailOldHref) {
        const oldVideoID = await getBvIDFromURL(thumbnailOldHref);
        if (oldVideoID && oldVideoID == videoID) {
            return overlay;
        }
    }

    overlay.style.setProperty(
        "--category-color",
        `var(--sb-category-preview-${category}, var(--sb-category-${category}))`
    );
    overlay.style.setProperty(
        "--category-text-color",
        `var(--sb-category-text-preview-${category}, var(--sb-category-text-${category}))`
    );
    text.innerText = chrome.i18n.getMessage(`category_${category}`);
    overlay.classList.add("sponsorThumbnailLabelVisible");

    return overlay;
}

function getOldThumbnailLabel(thumbnail: HTMLImageElement): HTMLElement | null {
    return thumbnail.querySelector("#sponsorThumbnailLabel") as HTMLElement | null;
}

function hideThumbnailLabel(thumbnail: HTMLImageElement): void {
    const oldLabel = getOldThumbnailLabel(thumbnail);
    if (oldLabel) {
        oldLabel.classList.remove("sponsorThumbnailLabelVisible");
    }
}

async function createOrGetThumbnail(thumbnail: HTMLImageElement): Promise<{ overlay: HTMLElement; text: HTMLElement }> {
    const oldLabelElement = getOldThumbnailLabel(thumbnail);
    if (oldLabelElement) {
        return {
            overlay: oldLabelElement as HTMLElement,
            text: oldLabelElement.querySelector("span") as HTMLElement,
        };
    }

    const overlay = document.createElement("div") as HTMLElement;
    overlay.id = "sponsorThumbnailLabel";
    // Disable hover autoplay
    overlay.addEventListener("pointerenter", (e) => {
        e.stopPropagation();
        thumbnail.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    });
    overlay.addEventListener("pointerleave", (e) => {
        e.stopPropagation();
        thumbnail.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    });

    // try append after image element, exclude avatar in feed popup
    // wait unitl there is an anchor point, or the label might get inserted elsewhere and break the header
    const labelAnchor =
        (await waitFor(
            () =>
                thumbnail.querySelector(
                    "div:not(.b-img--face) > picture img:not(.bili-avatar-img), div.bili-cover-card__thumbnail > img"
                ),
            10000,
            1000
        )) ?? thumbnail.lastChild;
    const icon = createSBIconElement();
    const text = document.createElement("span");
    overlay.appendChild(icon);
    overlay.appendChild(text);
    labelAnchor.after(overlay);

    return {
        overlay,
        text,
    };
}

function createSBIconElement(): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 565.15 568");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#SponsorBlockIcon");
    svg.appendChild(use);
    return svg;
}

// Inserts the icon svg definition, so it can be used elsewhere
export function insertSBIconDefinition() {
    const container = document.createElement("span");

    // svg from /public/icons/PlayerStartIconSponsorBlocker.svg, with useless stuff removed
    container.innerHTML = `
<svg viewBox="0 0 565.15 568" style="display: none">
  <defs>
    <g id="SponsorBlockIcon">
      <path d="M282.58,568a65,65,0,0,1-34.14-9.66C95.41,463.94,2.54,300.46,0,121A64.91,64.91,0,0,1,34,62.91a522.56,522.56,0,0,1,497.16,0,64.91,64.91,0,0,1,34,58.12c-2.53,179.43-95.4,342.91-248.42,437.3A65,65,0,0,1,282.58,568Zm0-548.31A502.24,502.24,0,0,0,43.4,80.22a45.27,45.27,0,0,0-23.7,40.53c2.44,172.67,91.81,330,239.07,420.83a46.19,46.19,0,0,0,47.61,0C453.64,450.73,543,293.42,545.45,120.75a45.26,45.26,0,0,0-23.7-40.54A502.26,502.26,0,0,0,282.58,19.69Z"/>
      <path d="M 284.70508 42.693359 A 479.9 479.9 0 0 0 54.369141 100.41992 A 22.53 22.53 0 0 0 42.669922 120.41992 C 45.069922 290.25992 135.67008 438.63977 270.83008 522.00977 A 22.48 22.48 0 0 0 294.32031 522.00977 C 429.48031 438.63977 520.08047 290.25992 522.48047 120.41992 A 22.53 22.53 0 0 0 510.7793 100.41992 A 479.9 479.9 0 0 0 284.70508 42.693359 z M 220.41016 145.74023 L 411.2793 255.93945 L 220.41016 366.14062 L 220.41016 145.74023 z "/>
    </g>
  </defs>
</svg>`;
    document.body.appendChild(container);
}

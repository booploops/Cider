require("v8-compile-cache");

import {join} from "path";
import {app, Notification} from "electron"
import {utils} from "./base/utils";

if (!app.isPackaged) {
    app.setPath("userData", join(app.getPath("appData"), "Cider"));
}

import {Store} from "./base/store";
import {AppEvents} from "./base/app";
import {Plugins} from "./base/plugins";
import {BrowserWindow} from "./base/browserwindow";
import {init as Sentry} from "@sentry/electron";
import {RewriteFrames} from "@sentry/integrations";
import {components, ipcMain} from "electron"

// Analytics for debugging fun yeah.
Sentry({
    dsn: "https://68c422bfaaf44dea880b86aad5a820d2@o954055.ingest.sentry.io/6112214",
    integrations: [
        new RewriteFrames({
            root: process.cwd(),
        }),
    ],
});

new Store();
const Cider = new AppEvents();
const CiderPlug = new Plugins();

/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * App Event Handlers
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/

app.on("ready", () => {
    Cider.ready(CiderPlug);

    console.log("[Cider] Application is Ready. Creating Window.")
    if (!app.isPackaged) {
        console.info("[Cider] Running in development mode.")
        require("vue-devtools").install()
    }

    components.whenReady().then(async () => {
        const bw = new BrowserWindow()
        const win = await bw.createWindow()

        app.getGPUInfo("complete").then(gpuInfo => {
            console.log(gpuInfo)
        })

        console.log("[Cider][Widevine] Status:", components.status());
        Cider.bwCreated();
        win.on("ready-to-show", () => {
            console.debug("[Cider] Window is Ready.")
            CiderPlug.callPlugins("onReady", win);
            win.show();
        });
    });

});

/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * Renderer Event Handlers
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/

ipcMain.handle("renderer-ready", (event) => {
    CiderPlug.callPlugins("onRendererReady", event);
})

ipcMain.on("playbackStateDidChange", (_event, attributes) => {
    CiderPlug.callPlugins("onPlaybackStateDidChange", attributes);
});

ipcMain.on("nowPlayingItemDidChange", (_event, attributes) => {
    console.log("[Cider] Now Playing Item Changed:", attributes);
    CiderPlug.callPlugins("onNowPlayingItemDidChange", attributes);
    if (
        attributes?.name && attributes?.artistName && attributes?.albumName
    ) {
        let artworkUrl = attributes?.artwork?.url ?? '';
        if (artworkUrl !== '') {
            artworkUrl = artworkUrl.replace("{f}", ".jpg")
                .replace("{w}", "40")
                .replace("{h}", "40")
        }
        let name = attributes?.name.replace(/&/g, "&amp;")
        let artistName = attributes?.artistName.replace(/&/g, "&amp;")
        let albumName = attributes?.albumName.replace(/&/g, "&amp;")

        const notification = new Notification({
            //language=XML
            toastXml: `
                <toast>
                    <visual>
                        <binding template="ToastGeneric">
                            <text id="1">${name ?? ''}</text>
                            <text id="2">${artistName ?? ''} - ${albumName ?? ''}</text>
                        </binding>
                    </visual>
                    <actions>
                        <action content="Play/Pause" activationType="protocol" arguments="cider://playpause/"/>
                        <action content="Next" activationType="protocol" arguments="cider://nextitem/"/>
                    </actions>
                </toast>
            `
        })
        notification.show()
        // timeout after 5 seconds
        setTimeout(() => {
            notification.close()
        }, 5000)
    }
});

app.on("before-quit", () => {
    CiderPlug.callPlugins("onBeforeQuit");
    console.warn(`${app.getName()} exited.`);
});

/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * Widevine Event Handlers
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/

// @ts-ignore
app.on("widevine-ready", (version, lastVersion) => {
    if (null !== lastVersion) {
        console.log("[Cider][Widevine] Widevine " + version + ", upgraded from " + lastVersion + ", is ready to be used!")
    } else {
        console.log("[Cider][Widevine] Widevine " + version + " is ready to be used!")
    }
})

// @ts-ignore
app.on("widevine-update-pending", (currentVersion, pendingVersion) => {
    console.log("[Cider][Widevine] Widevine " + currentVersion + " is ready to be upgraded to " + pendingVersion + "!")
})

// @ts-ignore
app.on("widevine-error", (error) => {
    console.log("[Cider][Widevine] Widevine installation encountered an error: " + error)
    app.exit()
})

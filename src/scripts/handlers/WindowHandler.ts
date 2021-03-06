import MusicPlayer from "../MusicPlayer";
import { Mouse2MEI } from "../utils/Mouse2MEI";
import Handler from "./Handler";
import ScoreManipulatorHandler from "./ScoreManipulatorHandler";
import { constants as c } from "../constants"
import Annotations from "../gui/Annotations";
import InsertModeHandler from "./InsertModeHandler";
import * as cq from "../utils/convenienceQueries"
import * as meiConverter from "../utils/MEIConverter"


class WindowHandler implements Handler{

    m2m?: Mouse2MEI;
    musicPlayer?: MusicPlayer;
    currentMEI?: string | Document;
    annotations: Annotations;
    loadDataCallback: (pageURI: string, data: string | Document | HTMLElement, isUrl: boolean, targetDivID: string) => Promise<string>;
    insertModeHandler: InsertModeHandler;
    containerId: string;
    rootSVG: Element
    interactionOverlay: Element

    svgReloadCallback: () => void

    setListeners(){
        window.addEventListener("scroll", this.update)
        window.addEventListener("resize", this.update)
        window.addEventListener("resize", this.updateSVG)
        window.addEventListener("deviceorientation", this.update)
        document.querySelector("#"+ this.containerId + " #sidebarContainer").addEventListener("transitionend", this.update)
        document.querySelector("#"+ this.containerId + " #sidebarContainer").addEventListener("transitionend", this.updateSVG)
        this.rootSVG.addEventListener("scroll", this.update)
        this.rootSVG.addEventListener("resize", this.update)
        this.rootSVG.addEventListener("deviceorientation", this.update)

        document.addEventListener("fullscreenchange", this.update)

        return this
    }

    removeListeners() {
        window.removeEventListener("scroll", this.update)
        window.removeEventListener("resize", this.update)
        window.removeEventListener("resize", this.updateSVG)
        window.removeEventListener("deviceorientation", this.update)
        document.querySelector("#"+ this.containerId + " #sidebarContainer").removeEventListener("transitionend", this.update)
        document.querySelector("#"+ this.containerId + " #sidebarContainer").removeEventListener("transitionend", this.updateSVG)
        this.rootSVG.removeEventListener("scroll", this.update)
        this.rootSVG.removeEventListener("resize", this.update)
        this.rootSVG.removeEventListener("deviceorientation", this.update)

        document.removeEventListener("fullscreenchange", this.update)

        return this
    }

    /**
     * Update all elements that are affected by a size change
     */
    update = (function update(e: Event){
        // special rule for transition events since so much with different propertynames are fired
        if(e instanceof TransitionEvent){ 
            if(e.propertyName !== "width") return
        }
        var that = this
        window.clearTimeout(isScrolling)

        var isScrolling = setTimeout(function(){
            that.m2m?.update()
            that.annotations?.update()
            that.insertModeHandler?.getPhantomNoteHandler()?.resetCanvas()
        }, 500)  
    }).bind(this)

    /**
     * Only for safari and firefox browsers
     */
    updateSVG = (function updateSVG(e: Event){
        var t = e.target as HTMLElement
        if((["apple", "firefox"].some(n => navigator.userAgent.toLowerCase().includes(n) && !navigator.userAgent.toLowerCase().includes("chrome")) 
        && t.id === "sidebarContainer" 
        && (e as TransitionEvent).propertyName !== "width") || e.type === "resize"){
            var mei = meiConverter.restoreXmlIdTags(this.currentMEI)
            this.loadDataCallback("", mei, false, "svg_output")
        }
    }).bind(this)

    scoreChangedHandler = (function scoreChangedHandler(e: Event){
        console.log(e)
    }).bind(this)

    resetListeners(){
        this
            .removeListeners()
            .setListeners()

        return this
    }

    setM2M(m2m: Mouse2MEI){
        this.m2m = m2m
        return this
    }

    setAnnotations(annotations: Annotations){
        this.annotations = annotations
        return this
    }

    setCurrentMEI(mei: Document){
        this.currentMEI = mei
        return this
    }

    setContainerId(containerId: string) {
        this.containerId = containerId
        this.interactionOverlay = cq.getInteractOverlay(this.containerId)
        this.rootSVG = cq.getRootSVG(this.containerId)
        return this
    }

    setInsertModeHandler(imh: InsertModeHandler){
        this.insertModeHandler = imh
        return this
    }

    setLoadDataCallback(loadDataCallback: (pageURI: string, data: string | Document | HTMLElement, isUrl: boolean, targetDivID: string) => Promise<string>){
        this.loadDataCallback = loadDataCallback
        return this
    }

    setSVGReloadCallback(svgReloadCallback: () => Promise<boolean>){
        this.svgReloadCallback = svgReloadCallback
        return this
    }

    // setSMHandler(smHandler: ScoreManipulatorHandler){
    //     this.smHandler = smHandler
    //     return this
    // }
    
}

export default WindowHandler
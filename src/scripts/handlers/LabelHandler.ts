import * as meiConverter from "../utils/MEIConverter"
import { Mouse2MEI } from "../utils/Mouse2MEI";
import Handler from "./Handler";
import { constants as c } from "../constants"
import { uuidv4 } from "../utils/random";
import HarmonyLabel from "../gui/HarmonyLabel";
import TempoLabel from "../gui/TempoLabel"
import MusicPlayer from "../MusicPlayer";
import * as coordinates from "../utils/coordinates"
import Label from '../gui/Label'

const labelClasses = ["harm", "tempo", "note"]
const labelSelectors = "." + labelClasses.join(",.")

class LabelHandler implements Handler{
    m2m?: Mouse2MEI;
    musicPlayer?: MusicPlayer
    currentMEI?: Document;

    private labelCanvas: SVGElement
    private root: Element
    private labels: Map<string, Label>
    private isGlobal: boolean
    private elementId: string

    private loadDataCallback: (pageURI: string, data: string | Document | HTMLElement, isUrl: boolean, targetDivID: string) => Promise<string>

    constructor(){
        this.addCanvas()
    }

    /**
     * Set own canvas for manipulating labels
     */
    addCanvas(){
        if(typeof this.labelCanvas === "undefined"){
            this.labelCanvas = document.createElementNS(c._SVGNS_, "svg")
            this.labelCanvas.setAttribute("id", "labelCanvas")
        }
        this.root = document.getElementById(c._ROOTSVGID_)
        this.root.insertBefore(this.labelCanvas, this.root.firstChild)

        return this
    }

    /**
     * Create label instances for elements already present in the score.
     */
    initLabels(){
        this.labels = new Map()
        document.querySelectorAll(labelSelectors).forEach(el => {
            var className = labelClasses.filter(l => document.getElementById(el.id).classList.contains(l))[0]
            var inputString: string 
            switch(className){
                case "harm":
                    inputString = Array.from(document.getElementById(el.id).querySelectorAll(".text")).filter(el => el.textContent !== null)[0].textContent.trim()
                    this.labels.set(el.id, new HarmonyLabel(inputString, el.id, this.currentMEI))
                    break;
                case "tempo":
                    inputString = Array.from(document.getElementById(el.id).querySelectorAll(".text")).filter(e => /\d+/.test(e.textContent))[0].textContent.match(/\d+/).join("") || ""
                    this.labels.set(el.id, new TempoLabel(inputString, el.id, this.currentMEI))
                    break;
            }
        })
    }

    setListeners(): LabelHandler {
        document.querySelectorAll(".sylTextRect").forEach(s => {
            s.remove()
        })

        // isGlobal = false: Editor is not in harmony mode
        if(!this.isGlobal){
            document.getElementById(c._ROOTSVGID_).addEventListener("click", this.setHarmonyLabelHandlerClick, true)
            document.getElementById(c._ROOTSVGID_).addEventListener("mousemove", this.activateHarmonyHighlight)
            document.getElementById(c._ROOTSVGID_).addEventListener("keydown", this.closeModifyWindowHandler, true)
        }

        document.getElementById(c._ROOTSVGID_).addEventListener("click", this.closeModifyWindowHandler)
        document.addEventListener("keydown", this.setHarmonyLabelHandlerKey)
        document.querySelectorAll(labelSelectors).forEach(h => {
            h.addEventListener("mouseover", this.deactivateHarmonyHighlight)
            h.addEventListener("mouseleave", this.activateHarmonyHighlight)
            h.addEventListener("dblclick", this.modifyLabelHandler)
        })
        
        return this
    }

    removeListeners(): LabelHandler {
        document.getElementById(c._ROOTSVGID_).removeEventListener("click", this.closeModifyWindowHandler)
        document.getElementById(c._ROOTSVGID_).removeEventListener("click", this.setHarmonyLabelHandlerClick)
        document.removeEventListener("keydown", this.setHarmonyLabelHandlerKey)
        document.getElementById(c._ROOTSVGID_).removeEventListener("mousemove", this.activateHarmonyHighlight)
        document.getElementById(c._ROOTSVGID_).removeEventListener("keydown", this.closeModifyWindowHandler)
        document.querySelectorAll(labelSelectors).forEach(h => {
            h.removeEventListener("mouseenter", this.deactivateHarmonyHighlight)
            h.removeEventListener("mouseleave", this.activateHarmonyHighlight)
            h.removeEventListener("dblclick", this.modifyLabelHandler)
        })

        return this
    }

    setHarmonyLabelHandlerClick = (function setHarmonyLabelHandler(e: MouseEvent){
       if(document.body.classList.contains("harmonyMode")){
           this.harmonyLabelHandler(e)
       }
    }).bind(this)

    setTempoLabelHandlerClick = (function setTempoLabelHandlerClick(e: MouseEvent){
        this.tempoLabelHandler(e)
    }).bind(this)

    setHarmonyLabelHandlerKey = (function setHarmonyLabelHandler(e: KeyboardEvent){
        if(e.ctrlKey || e.metaKey){
             if(e.key === "k" && Array.from(document.querySelectorAll(".note, .chord, .rest, .mrest")).some(el => el.classList.contains("marked"))){
                e.preventDefault()
                this.harmonyLabelHandler(e)
            }
        }
     }).bind(this)

    // HARMONY LABELS

    /**
     * Open Inputbox for (first) selected Note
     */
    harmonyLabelHandler(e: Event){
        var root = document.getElementById(c._ROOTSVGID_)
        var rootBBox = root.getBoundingClientRect()
        var nextNote = document.querySelector(".note.marked, .chord.marked")
        if(nextNote === null){return}
        var nextNoteBBox = nextNote.getBoundingClientRect()
        var staffBBox = nextNote.closest(".staff").getBoundingClientRect()

        var posx = nextNoteBBox.left - nextNoteBBox.width/2 - window.scrollX - rootBBox.x - root.scrollLeft
        var posy = staffBBox.bottom - window.scrollY - rootBBox.y - root.scrollLeft
        if(this.currentMEI.querySelector("harm[startid=\"" + nextNote.id + "\"]") === null && !this.labelCanvas.hasChildNodes()){
            this.createInputBox(posx, posy, nextNote.id, "harm") 
        }else if(this.labelCanvas.hasChildNodes()){
            this.closeModifyWindow()
        }
    }

    
    setLabel(labelString: string, bboxId: string): Label{
        var className = labelClasses.filter(l => document.getElementById(bboxId).classList.contains(l))[0]
        var label: Label
        switch(className){
            case "note":
            case "chord":
            case "harm":
                label = new HarmonyLabel(labelString, bboxId, this.currentMEI)
                break;
            case "tempo":
                label = new TempoLabel(labelString, bboxId, this.currentMEI)
                break;
            default:
                return
        }
        if(this.labels.get(label.getElement().id) == undefined){
            this.labels.set(label.getElement().id, label)       
        }

        return label
    }

    activateHarmonyHighlight = (function highlightNextHarmonyHandler(e: MouseEvent){
        if(e.type === "mouseleave" && !this.isGlobal){
            document.getElementById(c._ROOTSVGID_).addEventListener("mousemove", this.activateHarmonyHighlight)
        }
        if(!this.isGlobal){
            this.highlightNextHarmony(e)
        }
    }).bind(this)

    deactivateHarmonyHighlight = (function deactivateHighlight(e: MouseEvent){
        // document.querySelectorAll(".marked").forEach(m => {
        //     m.classList.remove("marked")
        // })
        document.getElementById(c._ROOTSVGID_).removeEventListener("mousemove", this.activateHarmonyHighlight)
    }).bind(this)

    highlightNextHarmony(e: MouseEvent, active = true){
        if(!active){return}

        var posx = coordinates.adjustToPage(e.pageX, "x")
        var posy = coordinates.adjustToPage(e.pageY, "y")

        var nextNoteBBox = this.m2m.findScoreTarget(posx, posy)
        var el = document.getElementById(nextNoteBBox.id)
        
        if(el.closest(".chord") !== null){
            el = el.closest(".chord")
        }
        
        if(!el.classList.contains("marked")){
            document.querySelectorAll(".marked").forEach(m => {
                m.classList.remove("marked")
            })
            el.classList.add("marked")
        }
    }


    modifyLabelHandler = (function modifyLabelHandler(e: MouseEvent){
        document.querySelectorAll(".marked").forEach(m => {
            m.classList.remove("marked")
        })
        this.modifyLabel(e)
    }).bind(this)


    /**
     * modify existing label
     * @param e 
     * @returns 
     */
    modifyLabel(e: MouseEvent){
        var target = e.target as Element
        target = target.closest(labelSelectors)
        target.setAttribute("visibility", "hidden")
        var targetBBox = target.getBoundingClientRect()
        var root = document.getElementById(c._ROOTSVGID_)
        var rootBBox = root.getBoundingClientRect()
        var posx = targetBBox.x - window.scrollX - rootBBox.left - root.scrollLeft //coordinates.adjustToPage(e.pageX, "x")
        var posy = targetBBox.y - window.scrollY - rootBBox.top - root.scrollTop //coordinates.adjustToPage(e.pageY, "y")

        // prevent double input boxes for same Element
        this.elementId = target.id
        if(document.querySelector("*[refElementId=\"" + target.id + "\"]") !== null){
            return
        }
        var className = labelClasses.filter(l =>  target.classList.contains(l))[0] //assume only one output, therefore alway return idx 0  
        this.createInputBox(posx, posy, target.id, className)
    }

    submitLabelHandler = (function submitHandler(e: KeyboardEvent){
        if(e.key === "Enter" && this.labelCanvas.hasChildNodes()){
            this.submitLabel()
        }
    }).bind(this)


    closeModifyWindowHandler = (function closeModifyWindow(e: Event){
        if(e instanceof KeyboardEvent){
            if(e.key === "Escape"){
                this.closeModifyWindow()
            }
        }else if(e instanceof MouseEvent && (e.target as HTMLElement).id === c._ROOTSVGID_){
            this.closeModifyWindow()
        }
    }).bind(this)

    /**
     * Close the modification Window and make the hidden Element visible again
     */
    closeModifyWindow(){
        Array.from(this.labelCanvas.children).forEach(c => {
            c.remove()
        })
        // clean MEI from empty harm Elements
        this.currentMEI.querySelectorAll(labelClasses.join(",")).forEach(h => {
            document.getElementById(h.id)?.setAttribute("visibility", "visible")            
        })
    }
        
    submitLabel(){
        var labelDiv = this.labelCanvas.getElementsByClassName("labelDiv")[0]
        var text = labelDiv.textContent
        var refElementClass = labelClasses.filter(l => document.getElementById(labelDiv.closest("g").getAttribute("refElementId")).classList.contains(l))[0] // assume only one result
        var label = this.labels.get(labelDiv.closest("g").getAttribute("refElementId"))
        if(refElementClass === "harm"){ // change existing harm
            let harmLabel = label as HarmonyLabel
            harmLabel.modifyLabel(text)
            //this.currentMEI.getElementById(harmLabel.getElement().id).replaceWith(harmLabel.getElement())
        }else if(["note", "chord"].some(cn => refElementClass === cn )){ //create new harm
            let harmLabel = this.setLabel(labelDiv.textContent, labelDiv.closest("g").getAttribute("refElementId")) as HarmonyLabel
            this.currentMEI.getElementById(harmLabel.getStartId()).closest("measure").append(harmLabel.getElement())
        }else if(refElementClass === "tempo"){ // change existing tempo
            var tempoLabel = label as TempoLabel
            tempoLabel.modifyLabel(text)
        }

        this.closeModifyWindow()
        var mei = meiConverter.restoreXmlIdTags(this.currentMEI)
        this.loadDataCallback("", mei, false, c._TARGETDIVID_).then(() => {
            this.reset()
        })
    }

    createInputBox(posx: number, posy: number, targetId: string, targetClass: string){
        var textGroup = document.createElementNS(c._SVGNS_, "g")
        textGroup.setAttribute("id", uuidv4())
        textGroup.setAttribute("refElementId", targetId)

        var text = document.createElementNS(c._SVGNS_, "svg")
        text.classList.add("labelText")

        var textForeignObject = document.createElementNS(c._SVGNS_, "foreignObject")
        textForeignObject.classList.add("labelFO")
        var textDiv = document.createElement("div")
        textDiv.setAttribute("contenteditable", "true")
        
        switch(targetClass){
            case "harm":
                textDiv.textContent = this.labels.get(targetId)?.getInput() || ""
                break;
            case "tempo":
                textDiv.textContent = Array.from(document.getElementById(targetId).querySelectorAll(".text")).filter(el => /\d+/.test(el.textContent))[0].textContent.match(/\d+/).join("") || ""       
                break;
            default:
                return
        }
        
        textDiv.classList.add("labelDiv")
        text.append(textForeignObject)

        document.body.appendChild(textDiv)

        var rectPadding = 5

        text.setAttribute("x", (posx + rectPadding).toString())
        text.setAttribute("y", (posy).toString())

        textForeignObject.setAttribute("x", "0")
        textForeignObject.setAttribute("y", "0")
        textForeignObject.setAttribute("height", (textDiv.clientHeight + 2*rectPadding).toString())
        textForeignObject.setAttribute("width", (100+2*rectPadding).toString())

        this.labelCanvas.appendChild(textGroup)
        textGroup.appendChild(text)
        textForeignObject.appendChild(textDiv)

        // Special Listeners while Editing Harmonies
        var that = this
        textDiv.addEventListener("focus", function(){
            that.removeListeners()
            that.musicPlayer.removePlayListener()
        })

        textDiv.addEventListener("blur", function(){
            that.setListeners()
            that.musicPlayer.setPlayListener()
        })

        textDiv.addEventListener("keydown", this.submitLabelHandler)

        textDiv.focus()
    }

    getTimestamp(note: Element){
        var layer = note.closest("layer")
        var elements = Array.from(layer.querySelectorAll("*[dur]"))
        elements = elements.filter((v, i) => i <= elements.indexOf(note))
        var tstamp: number
        elements.forEach(e => {
            var dur = parseInt(e.getAttribute("dur"))
            tstamp += 4/dur
            var dots = e.getAttribute("dots")
            var add = dur
            if(dots !== null){
                for(var i = 0; i < parseInt(dots) ; i++){
                    add = add/2
                    tstamp += add
                }
            }
        })
        return tstamp
    }

    reset(){
        this.addCanvas()
        this.initLabels()
        this.removeListeners()
        this.setListeners()
        return this
    }

    setM2M(m2m: Mouse2MEI){
        this.m2m = m2m
        return this
    }

    setCurrentMEI(mei: Document){
        this.currentMEI = mei
        return this
    }

    setMusicPlayer(musicPlayer: MusicPlayer){
        this.musicPlayer = musicPlayer
        return this
    }

    setGlobal(global: boolean){
        this.isGlobal = global
        return this
    }

    getGlobal(){
        return this.isGlobal
    }

    setLoadDataCallback(loadDataCallback: (pageURI: string, data: string | Document | HTMLElement, isUrl: boolean, targetDivID: string) => Promise<string>){
        this.loadDataCallback = loadDataCallback
        return this
      }

}

export default LabelHandler
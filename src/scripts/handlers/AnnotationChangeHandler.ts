import MusicPlayer from "../MusicPlayer";
import { Mouse2MEI } from "../utils/Mouse2MEI";
import { constants as c } from "../constants"
import Handler from "./Handler";
import interact from "interactjs"
import { idxNoteMapFClef } from "../utils/mappings";
import { Annotation, Coord } from "../utils/Types";
import * as cq from "../utils/convenienceQueries"
import * as coordinates from "../utils/coordinates"
import { isConditionalExpression } from "typescript";

class AnnotationChangeHandler implements Handler{
    m2m?: Mouse2MEI;
    musicPlayer?: MusicPlayer;
    currentMEI?: string | Document;

    private customShapes: Array<Element>
    private updateCallback: () => void;
    private rootBBox: DOMRect;
    private rootMatrix: DOMMatrix
    //private canvasMatrix: DOMMatrix
    private snapCoords: { obj: Element; x: number; y: number; };
    private annotations: Annotation[];
    private dragedRect: SVGRectElement

    private shapeListener: Interact.Interactable
    private textListener: Interact.Interactable
    private lineListener: Interact.Interactable

    private annotResizedEvent: Event
    private dragAnnotStartEvent: Event
    private dragAnnotEndEvent: Event
    private interactTarget: Element
    private isInteracting: Boolean

    private containerId: string
    private container: Element
    private interactionOverlay: Element

    constructor(containerId: string){
        this.setContainerId(containerId)
        //this.update()
        this.annotResizedEvent = new Event("annotResized")
        this.dragAnnotStartEvent = new Event("dragAnnotStart")
        this.dragAnnotEndEvent = new Event("dragAnnotEnd")
        this.isInteracting = false
    }


    setListeners() {
        if(document.getElementById(this.containerId).querySelector(".sidebar.openSidebar") != null) return
        var that = this

        this.shapeListener = interact("#"+ this.containerId + " #interactionOverlay .customAnnotShape")
        .resizable({
            // resize from all edges and corners
            edges: { left: true, right: true, bottom: true, top: true },

            listeners: { 
                move: this.resizeShapeListener.bind(this),
                end(event){
                    that.interactionOverlay.dispatchEvent(new Event("annotationCanvasChanged"))
                    that.deleteTempDistances()
                    that.interactTarget.dispatchEvent(that.annotResizedEvent)
                    that.isInteracting = false
                }  
            },
        })
        .draggable({
            listeners: { 
                move: this.dragShapeListener.bind(this),
                end(event){
                    that.interactionOverlay.dispatchEvent(new Event("annotationCanvasChanged"))
                    that.deleteTempDistances()
                    that.interactTarget.dispatchEvent(that.dragAnnotEndEvent)
                    that.isInteracting = false
                } 
            },
            modifiers: [
                interact.modifiers.restrictRect({
                    restriction: 'parent',
                    endOnly: true
                })
            ]
        })

        this.textListener = interact("#"+ this.containerId + " #interactionOverlay .annotLinkedText, #"+ this.containerId + " #interactionOverlay .annotStaticText")
        .resizable({
            // resize from all edges and corners
            edges: { left: true, right: true, bottom: true, top: true },

            listeners: { 
                move: this.resizeTextListener.bind(this),
                end(event){
                    that.deleteTempDistances()
                    that.interactionOverlay.dispatchEvent(new Event("annotationCanvasChanged"))
                    that.interactTarget.dispatchEvent(that.annotResizedEvent)
                    that.isInteracting = false
                }  
            },
        })
        .draggable({
            listeners: { 
                move: this.dragTextListener.bind(this),
                end(event){
                    that.interactionOverlay.dispatchEvent(new Event("annotationCanvasChanged"))
                    that.deleteTempDistances()
                    that.interactTarget.dispatchEvent(that.dragAnnotEndEvent)
                    that.isInteracting = false
                }  
            },
            modifiers: [
                interact.modifiers.restrictRect({
                    restriction: 'parent',
                    endOnly: true
                })
            ]
        })

        this.lineListener = interact("#"+ this.containerId + " #interactionOverlay .lineDragRect.x1")
        .draggable({
            listeners: { 
                move: this.dragLineListener.bind(this),

                end(event){
                    that.snapToObj()
                    that.interactionOverlay.dispatchEvent(new Event("annotationCanvasChanged"))
                    that.deleteTempDistances()
                    that.interactTarget.dispatchEvent(that.dragAnnotEndEvent)
                    that.isInteracting = false
                }
            },
            modifiers: [
                interact.modifiers.restrictRect({
                    restriction: 'parent',
                    endOnly: true
                })
            ]
        })

    }

    removeListeners(): void {
        //interact(".customAnnotShape, .annotLinkedText, .lineDragRect").unset()
        this.shapeListener?.unset()
        this.lineListener?.unset()
        this.textListener?.unset()
    }

    resetListeners(){
        this.removeListeners()
        this.setListeners()
    }

    // SHAPES
    dragShapeListener (event) {
        var target = event.target as HTMLElement
        this.interactTarget = target
        if(!this.isInteracting){
            this.interactTarget.dispatchEvent(this.dragAnnotStartEvent)
        }
        this.isInteracting = true
        var pt = coordinates.transformToDOMMatrixCoordinates(event.clientX, event.clientY, this.interactionOverlay) //new DOMPoint(event.clientX, event.clientY)
        var edx = pt.x //pt.matrixTransform(this.canvasMatrix).x
        var edy = pt.y //pt.matrixTransform(this.canvasMatrix).y

        var ptDist = coordinates.transformToDOMMatrixCoordinates(target.getBoundingClientRect().x, event.target.getBoundingClientRect().y, this.interactionOverlay)//   new DOMPoint(target.getBoundingClientRect().x, event.target.getBoundingClientRect().y)
        var distX = (parseFloat(target.getAttribute('distX'))) || edx - ptDist.x //ptDist.matrixTransform(this.canvasMatrix).x 
        var distY = (parseFloat(target.getAttribute('distY'))) || edy - ptDist.y //ptDist.matrixTransform(this.canvasMatrix).y 

        target.setAttribute("distX", distX.toString())
        target.setAttribute("distY", distY.toString())

        target.setAttribute("x", (edx - distX).toString())
        target.setAttribute("y", (edy - distY).toString())

        var targetParent = target.parentElement as Element
        var line = targetParent.querySelector(":scope > .annotLine")

        pt = coordinates.transformToDOMMatrixCoordinates(target.getBoundingClientRect().x, event.target.getBoundingClientRect().y, this.interactionOverlay) //new DOMPoint(target.getBoundingClientRect().x, target.getBoundingClientRect().y)

        var rectX = pt.x.toString() //pt.matrixTransform(this.canvasMatrix).x.toString() 
        var rectY = pt.y.toString() //pt.matrixTransform(this.canvasMatrix).y.toString() 

        if(line!== null){
            line.setAttribute("x1", rectX)
            line.setAttribute("y1", rectY)
        }
    }

    resizeShapeListener(event){
        var target = event.target as HTMLElement
        this.interactTarget = target

        // update overal dimensions
        var pt = coordinates.getDOMMatrixCoordinates(event.rect, this.interactionOverlay)
        target.style.width = pt.width + 'px'
        target.style.height = pt.height + 'px'

        // translate when resizing from top or left edges
        if(event.edges.top === true || event.edges.left === true){
            var edgesPt = coordinates.transformToDOMMatrixCoordinates(event.clientX, event.clientY, this.interactionOverlay)// new DOMPoint(event.clientX, event.clientY)
            var edx = edgesPt.x //pt.matrixTransform(this.canvasMatrix).x
            var edy = edgesPt.y //pt.matrixTransform(this.canvasMatrix).y

            var ptDist = coordinates.transformToDOMMatrixCoordinates(target.getBoundingClientRect().x, event.target.getBoundingClientRect().y, this.interactionOverlay) //new DOMPoint(target.getBoundingClientRect().x, event.target.getBoundingClientRect().y)
            var distX = (parseFloat(target.getAttribute('distX'))) || edx - ptDist.x //ptDist.matrixTransform(this.canvasMatrix).x 
            var distY = (parseFloat(target.getAttribute('distY'))) || edy - ptDist.y //ptDist.matrixTransform(this.canvasMatrix).y 

            target.setAttribute("distX", distX.toString())
            target.setAttribute("distY", distY.toString())

            if(event.edges.left === true) target.setAttribute("x", (edx - distX).toString())

            if(event.edges.top === true) target.setAttribute("y", (edy - distY).toString())
            //target.textContent = Math.round(event.rect.width) + '\u00D7' + Math.round(event.rect.height)
        }
        
        //update attached line
        var targetParent = target.parentElement
        var line = targetParent?.querySelector(".annotLine")
        var dragRects = targetParent?.querySelectorAll(".lineDragRect")

        var rectX = pt.x.toString() //ptTL.matrixTransform(this.canvasMatrix).x.toString()
        var rectY = pt.y.toString() //ptTL.matrixTransform(this.canvasMatrix).y.toString()
        
        if(line!== null){
            line.setAttribute("x1", rectX)
            line.setAttribute("y1", rectY)
        }

        if(dragRects.length > 0){
            dragRects.forEach(dr => {
                if(dr.classList.contains("x1")){
                    dr.setAttribute("x", rectX)
                    dr.setAttribute("y", rectY)
                }
            });
        }
    }

    // TEXTBOXES
    resizeTextListener(event){
        var target = event.target.querySelector(".annotFO") as HTMLElement
        this.interactTarget = target
        //this.canvasMatrix = (document.getElementById("annotationCanvas") as unknown as SVGGraphicsElement).getScreenCTM().inverse()

        // update overal dimensions
        var ptTL = coordinates.getDOMMatrixCoordinates(event.rect, this.interactionOverlay)
        target.style.width = ptTL.width + 'px'
        target.style.height = ptTL.height + 'px'

        // translate when resizing from top or left edges
        if(event.edges.top === true || event.edges.left === true){
            var pt = coordinates.transformToDOMMatrixCoordinates(event.clientX, event.clientY, this.interactionOverlay) //new DOMPoint(event.clientX, event.clientY)
            var edx = pt.x //.matrixTransform(this.canvasMatrix).x
            var edy = pt.y //matrixTransform(this.canvasMatrix).y

            var ptDist = coordinates.transformToDOMMatrixCoordinates(target.getBoundingClientRect().x, event.target.getBoundingClientRect().y, this.interactionOverlay) //new DOMPoint(target.getBoundingClientRect().x, event.target.getBoundingClientRect().y)
            var distX = (parseFloat(target.getAttribute('distX'))) || edx - ptDist.x //matrixTransform(this.canvasMatrix).x 
            var distY = (parseFloat(target.getAttribute('distY'))) || edy - ptDist.y //matrixTransform(this.canvasMatrix).y 

            target.setAttribute("distX", distX.toString())
            target.setAttribute("distY", distY.toString())

            if(event.edges.left === true) target.setAttribute("x", (edx - distX).toString())

            if(event.edges.top === true) target.setAttribute("y", (edy - distY).toString())
            //target.textContent = Math.round(event.rect.width) + '\u00D7' + Math.round(event.rect.height)
        }
        
        //update attached line
        var targetParent = target.closest("g")
        var line = targetParent?.querySelector(".annotLine")
        var dragRects = targetParent?.querySelectorAll(".lineDragRect")

        var rectX = ptTL.x.toString() //.matrixTransform(this.canvasMatrix).x.toString()
        var rectY = ptTL.y.toString() //).matrixTransform(this.canvasMatrix).y.toString()
        
        if(line!== null){
            line.setAttribute("x2", rectX)
            line.setAttribute("y2", rectY)
        }

        if(dragRects.length > 0){
            dragRects.forEach(dr => {
                if(dr.classList.contains("x2")){
                    dr.setAttribute("x", rectX)
                    dr.setAttribute("y", rectY)
                }
            });
        }
    }

    dragTextListener(event){
        var target = event.target.querySelector(".annotFO")
        this.interactTarget = target
        if(!this.isInteracting){
            this.interactTarget.dispatchEvent(this.dragAnnotStartEvent)
        }
        this.isInteracting = true
        //this.canvasMatrix = (document.getElementById("annotationCanvas") as unknown as SVGGraphicsElement).getScreenCTM().inverse()
        var pt = coordinates.transformToDOMMatrixCoordinates(event.clientX, event.clientY, this.interactionOverlay) //new DOMPoint(event.clientX, event.clientY)
        var edx = pt.x //matrixTransform(this.canvasMatrix).x
        var edy = pt.y //matrixTransform(this.canvasMatrix).y

        var ptDist = coordinates.transformToDOMMatrixCoordinates(target.getBoundingClientRect().x, target.getBoundingClientRect().y, this.interactionOverlay) //new DOMPoint(target.getBoundingClientRect().x, event.target.getBoundingClientRect().y)
        var distX = (parseFloat(target.getAttribute('distX'))) || edx - ptDist.x //matrixTransform(this.canvasMatrix).x 
        var distY = (parseFloat(target.getAttribute('distY'))) || edy - ptDist.y //matrixTransform(this.canvasMatrix).y 

        target.setAttribute("distX", distX.toString())
        target.setAttribute("distY", distY.toString())

        target.setAttribute("x", (edx - distX).toString())
        target.setAttribute("y", (edy - distY).toString())

        var targetParent = target.closest("g")
        var line = targetParent.querySelector(".annotLine")
        var dragRects = targetParent.querySelectorAll(".lineDragRect")

        pt = coordinates.transformToDOMMatrixCoordinates(target.getBoundingClientRect().x, target.getBoundingClientRect().y, this.interactionOverlay) //new DOMPoint(target.getBoundingClientRect().x, target.getBoundingClientRect().y)

        var rectX = pt.x.toString() //.matrixTransform(this.canvasMatrix).x.toString() 
        var rectY = pt.y.toString() //matrixTransform(this.canvasMatrix).y.toString() 

        if(line!== null){
            line.setAttribute("x2", rectX)
            line.setAttribute("y2", rectY)
        }

        if(dragRects.length > 0){
            dragRects.forEach(dr => {
                if(dr.classList.contains("x2")){
                    dr.setAttribute("x", rectX)
                    dr.setAttribute("y", rectY)
                }
            });
        }
    }

    //LINES

    dragLineListener(event){
        if(document.getElementById(this.containerId).querySelector(".sidebar.openSidebar") != null) return
        var target = event.target as SVGRectElement
        this.interactTarget = target
        if(!this.isInteracting){
            this.interactTarget.dispatchEvent(this.dragAnnotStartEvent)
        }
        this.isInteracting = true
        //this.canvasMatrix = (document.getElementById("annotationCanvas") as unknown as SVGGraphicsElement).getScreenCTM().inverse()
        this.dragedRect = target
        var pt = coordinates.transformToDOMMatrixCoordinates(event.clientX, event.clientY, this.interactionOverlay) //new DOMPoint(event.clientX, event.clientY)
        var edx = pt.x //matrixTransform(this.canvasMatrix).x
        var edy = pt.y //matrixTransform(this.canvasMatrix).y

        target.setAttribute("x", edx.toString())
        target.setAttribute("y", edy.toString())

        var targetParent = target.closest("g")
        var line = targetParent.querySelector(".annotLine")

        pt = coordinates.transformToDOMMatrixCoordinates(target.getBoundingClientRect().x, target.getBoundingClientRect().y, this.interactionOverlay)
        var rectX = pt.x.toString() //.matrixTransform(this.canvasMatrix).x.toString() 
        var rectY = pt.y.toString() //matrixTransform(this.canvasMatrix).y.toString() 

        if(target.classList.contains("x1")){
            line.setAttribute("x1", rectX)
            line.setAttribute("y1", rectY)
            this.highlightNextAttachObject(target)
        }

        this.interactionOverlay.dispatchEvent(new Event("annotChanged"))
    }

    /**
     * Highlight the next Element where the lineDragRect could attach to
     * @param lineDragRect 
     * @returns 
     */
    highlightNextAttachObject(lineDragRect: SVGRectElement): Element{

        var pt = coordinates.transformToDOMMatrixCoordinates(lineDragRect.getBoundingClientRect().x, lineDragRect.getBoundingClientRect().y, this.interactionOverlay)

        var posx = pt.x 
        var posy = pt.y 
        
        var nextScoreObj = this.m2m.findScoreTarget(posx, posy)
        var nextShapeObj = this.findCustomShapeTarget(posx, posy)
        var possibleCoords = new Array<Coord>()

        var shapeCoord: Coord
        if(nextShapeObj !== null){
            var shapept = coordinates.transformToDOMMatrixCoordinates(nextShapeObj.getBoundingClientRect().x, nextShapeObj.getBoundingClientRect().y, this.interactionOverlay)
            shapeCoord = {
                obj: nextShapeObj,
                x: shapept.x,
                y: shapept.y 
            }
            possibleCoords.push(shapeCoord)
        }

        if(nextScoreObj != undefined){
            var measurept = coordinates.transformToDOMMatrixCoordinates(nextScoreObj.parentMeasure.getBoundingClientRect().x, nextScoreObj.parentMeasure.getBoundingClientRect().y, this.interactionOverlay)
            var measureCoord: Coord = {
                obj: nextScoreObj.parentMeasure,
                x: measurept.x,
                y: measurept.y
            } 
            possibleCoords.push(measureCoord)

            var staffpt = coordinates.transformToDOMMatrixCoordinates(nextScoreObj.parentStaff.getBoundingClientRect().x, nextScoreObj.parentStaff.getBoundingClientRect().y, this.interactionOverlay)
            var staffCoord: Coord = {
                obj: nextScoreObj.parentStaff,
                x: staffpt.x, 
                y: staffpt.y
            } 
            possibleCoords.push(staffCoord)
            
            var notept = coordinates.transformToDOMMatrixCoordinates(document.getElementById(nextScoreObj.id).getBoundingClientRect().x, document.getElementById(nextScoreObj.id).getBoundingClientRect().y, this.interactionOverlay)
            var noteCoord: Coord = {
                obj:  cq.getRootSVG(this.containerId).querySelector("#"+nextScoreObj.id),
                x: notept.x, 
                y: notept.y
            }
            possibleCoords.push(noteCoord)
        }

        var tempDist: number = Math.pow(10, 10)
        var objToHighlight: Element; 
        var objCoord: Coord
        possibleCoords.forEach(coord => {
            var dist = Math.sqrt(Math.abs(coord.x - posx)**2 + Math.abs(coord.y - posy)**2)
            if(dist < tempDist){
                tempDist = dist
                objToHighlight = coord.obj
                objCoord = coord
            }
        })
        this.updateAnnotationIDs(objToHighlight, lineDragRect, objCoord)
        return objToHighlight
    }

    /**
     * Find nearest Custom Shape to given Position (e.g. Mouse)
     * @param posx 
     * @param posy 
     * @returns 
     */
     findCustomShapeTarget(posx: number, posy: number): Element{
        var shapes = Array.from(this.interactionOverlay.querySelectorAll(".customAnnotShape"))

        var nextShape: Element
        var tempDist: number = Math.pow(10, 10)
        shapes.forEach(s => {
            var pt = coordinates.transformToDOMMatrixCoordinates(s.getBoundingClientRect().x, s.getBoundingClientRect().y, this.interactionOverlay)
            //var spt = pt.matrixTransform(this.rootMatrix)
            var dist = Math.sqrt(Math.abs(pt.x - posx)**2 + Math.abs(pt.y - posy)**2)
            if(dist < tempDist){
                tempDist = dist
                nextShape = s
            }
        })
        if(nextShape == undefined){
            return null
        }
        return nextShape
    }

    /**
     * Update Set of saved Annotations and their relations to Shapes or Score
     * @param objToAttach 
     * @param lineDragRect 
     */
     updateAnnotationIDs(objToAttach: Element, lineDragRect: SVGRectElement, objCoord: Coord){
        var line: Element
        var targetx: number
        var targety: number
        var highlightRect: SVGRectElement
        var parentGroup = lineDragRect.closest("g")

        var otaBBox = objToAttach.getBoundingClientRect()
        this.annotations.some(annot => {
            if(annot.sourceID = parentGroup.id){
                var pt = coordinates.getDOMMatrixCoordinates(otaBBox, this.interactionOverlay)
                annot.targetID = objToAttach.id
                targetx = pt.x 
                targety = pt.y 

                // draw rect for highlighting
                if(parentGroup.querySelector(".highlightAnnotation") === null){
                    highlightRect = document.createElementNS(c._SVGNS_, "rect")
                    parentGroup.insertBefore(highlightRect, parentGroup.firstChild)
                }else{
                    highlightRect = parentGroup.querySelector(".highlightAnnotation")
                }

                var highlightMargin = 0
                highlightRect.classList.add("highlightAnnotation")
                highlightRect.setAttribute("x", (targetx - highlightMargin).toString())
                highlightRect.setAttribute("y", (targety - highlightMargin).toString())
                highlightRect.setAttribute("height", (pt.height + 2*highlightMargin).toString())
                highlightRect.setAttribute("width", (pt.width + 2*highlightMargin).toString())

                return annot.sourceID === parentGroup.id
            }
        })

        this.snapCoords = {
            obj: line,
            x: targetx,
            y: targety
        }

        // this.container.querySelectorAll("*[fill=green]").forEach(fg => {
        //     fg.removeAttribute("fill")
        // })
        objToAttach.setAttribute("fill", "green")

        // some rules for custom shapes
        if(objToAttach.classList.contains("customAnnotShape")){
            parentGroup.querySelector(".highlightAnnotation").remove()
            // ensure that only one shape is attached
            if(parentGroup.querySelector(".customAnnotShape") !== null){
                var prevShape = parentGroup.querySelector(".customAnnotShape")
                parentGroup.parentElement.appendChild(prevShape)
            }
            parentGroup.insertBefore(objToAttach, parentGroup.firstChild)

            var newAnnot: Annotation = {
                sourceID: objToAttach.id,
                targetID: new Array<string>()
            }

            // get annotated elements into shape info
            var shapeBBox = objToAttach.getBoundingClientRect()
            var shapeX = shapeBBox.x
            var shapeY = shapeBBox.y
            this.m2m.getNoteBBoxes().forEach(bb => {
                if( bb.x >= shapeX && 
                    bb.x <= shapeX + shapeBBox.width &&
                    bb.y >= shapeY &&
                    bb.y <= shapeY + shapeBBox.height){
                        (newAnnot.targetID as Array<string>).push(bb.id)
                    }
            })
            this.annotations.push(newAnnot)
        }
    }

    /**
     * Delete attributes from Elements which are just used temporarily to resize or drag objects
     */
    deleteTempDistances(){
       this.interactionOverlay.querySelector("#annotationCanvas").querySelectorAll("*[distX], *[distY]").forEach(d => {
            d.removeAttribute("distX")
            d.removeAttribute("distY")
        })
    }

    /**
     * Snap Annotation Pointer to highlighted Object
     */
     snapToObj(){
        this.dragedRect.setAttribute("x", this.snapCoords.x.toString())
        this.dragedRect.setAttribute("y", this.snapCoords.y.toString())
        var line = this.dragedRect.closest("g").querySelector(".annotLine")
        line.setAttribute("x1", this.snapCoords.x.toString())
        line.setAttribute("y1", this.snapCoords.y.toString())

        // clean up after snap
        this.interactionOverlay.querySelector("#annotationCanvas").querySelectorAll("g").forEach(el => {
            var shapeChild = el.querySelector(".customAnnotShape")
            var highlightChild = el.querySelector(".highlightAnnotation")
            if(shapeChild !== null && el.childElementCount === 1){
                el.parentElement.appendChild(shapeChild)
                document.getElementById(el.id).remove()
            }

            if(shapeChild !== null && highlightChild !== null){
                el.parentElement.appendChild(shapeChild)
            }
        })
    }


    // change to function after implementation
    selectHandler = (function selectHandler(e: MouseEvent){
        var target = e.target as Element
        if(target.tagName === "rect"){
            var bbox = target.getBoundingClientRect()
            this.attachCornerCircle(target, bbox.x, bbox.y)
        }
        //TODO: Circles etc
    }).bind(this)

    update(){
        this.setContainerId(this.containerId)
        //this.updateCallback()
        this.rootBBox = this.interactionOverlay.getBoundingClientRect()
        this.rootMatrix = (this.interactionOverlay as unknown as SVGGraphicsElement).getScreenCTM().inverse()
        this.customShapes = Array.from(this.interactionOverlay.querySelectorAll(".customAnnotShape"))
        //this.resetListeners()
        return this
    }

    setUpdateCallback(updateCallback: ()=> void){
        this.updateCallback = updateCallback
        return this
    }

    setAnnotations(annotations: Array<Annotation>){
        this.annotations = annotations
        return this
    }

    setM2M(m2m: Mouse2MEI){
        this.m2m = m2m
        return this
    }

    setContainerId(id: string){
        this.containerId = id
        this.container = document.getElementById(id)
        this.interactionOverlay = cq.getInteractOverlay(id)
        return this
    }
}

export default AnnotationChangeHandler
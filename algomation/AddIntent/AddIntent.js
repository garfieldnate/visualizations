// animated AddIntent algorithm
// future work: create algo.layout.Lattice, implemented with http://estrada.cune.edu/facweb/john.snow/drawlat.html or 
// other, and extending algo.layout.GraphForceDirected. That would make the graphs look a lot better!
function* algorithm() {

        // create graph and supply callbacks for create, update, destroy operations on vertices and edges
        var graph = new algo.core.Graph({

            createVertex: _.bind(function(vertex, gfd) {
                var concept = new Concept(vertex.intent, vertex.extent);
                vertex.label = concept.label;
                return concept;
            }, this),

            createEdge: _.bind(function(edge, gfd) {

                return new algo.render.Arrow({
                    startArrow: false,
                    endArrow: false
                });

            }, this),

            updateVertex: _.bind(function(vertex, element, box) {
                //move the concept rectangle to the location of the box
                element.layout(box);
            }, this),

            updateEdge: _.bind(function(edge, element, start, middle, end, gfd) {

                // get a line connecting the circumference of each vertex element (which are circles )
                var lineSegment = algo.layout.Line.getConnector(edge.source.element, edge.target.element);
                element.set({
                    shape: lineSegment
                });

            }, this)
        });

        // create layout strategy and supply the graph it operates on
        var layout = new algo.layout.GraphDirected(graph, {
            vertexWidth: 500,
            vertexHeight: 50,
            nodeSeparation: 25,
            edgeSeparation: 25,
            rankSeparation: 25,
            direction: "BT"
        });

        //this global variable determines a do/undo stack level used by trackSet/undoSet
        var setCounter = 0;

        //=Initialize
        var bottom = graph.addVertex({
            intent: "abcdefgh",
            extent: "",
        });
        layout.update(algo.BOUNDS.inflate(-10, -10));

        yield ({
            step: "Create a dummy root node with an intent containing all possible features",
            line: "//=Initialize"
        });

        //the itnents and extents of each concept to be inserted; use var order to insert them in random order.
        var intents = ["a", "b", "c", "d", "e", "f", "g", "h", "ab", "bg", "cde", "abcdef", "abcdefh", "abcdefgh", "cbg"];
        var extents = ["α", "β", "ς", "δ", "ε", "ζ", "η", "θ", "τ", "ψ", "λ", "μ", "π", "ξ", "ρ"];
        var order = _.shuffle(_.range(15));

        for (var i = 0; i < intents.length; i++) {
            //add the intent to the lattice
            newVertex =
                yield * (addIntent(intents[order[i]], bottom, graph));

            //=AddExtent
            //then add the extent to the newly created vertex and all its parents
            setCounter++;
            addExtent(extents[order[i]], newVertex, graph);
            yield ({
                step: "Add the extent to the returned concept and all of its parents",
                label: "//=AddExtent",
                variables: {
                    intent: newVertex.label,
                    extent: extents[order[i]],
                }
            });
            undoSetGraph(graph);
            setCounter--;
        }

        //=AddIntent
        function* addIntent(intent, generatorConcept, graph) {
            setCounter++;
            var i, j;
            highlightInsertPoint(generatorConcept);

            yield ({
                step: "Add intent '" + intentLabel(intent) + "' to concept '" + generatorConcept.label + "'",
                line: "//=AddIntent",
                variables: {
                    intent: intentLabel(intent),
                    generatorConcept: generatorConcept.label
                }
            });
            //=getMaximalConcept
            generatorConcept = getMaximalConcept(intent, generatorConcept, graph);
            yield ({
                step: "locate the generator concept for the given intent",
                label: "//=getMaximalConcept",
                variables: {
                    intent: intentLabel(intent),
                    generatorConcept: generatorConcept.label
                }
            });
            //=FoundDuplicate
            if (generatorConcept.intent === intent) {
                setCounter++;
                //this should just be state: algo.render.kS_GREEN, but undefined state would later throw an error
                trackSet(generatorConcept, {
                    fill: algo.Color.iGREEN,
                    stroke: algo.Color.iGREEN,
                    pen: algo.Color.iWHITE
                });
                yield ({
                    step: "'" + generatorConcept.label + "' is already in the lattice, so don't change anything.",
                    label: "//=FoundDuplicate",
                    variables: {
                        intent: intentLabel(intent),
                        generatorConcept: generatorConcept.label
                    }
                });
                undoSet(generatorConcept);
                setCounter--;

                // reset the coloring on the getMaximalConcept path
                undoSetGraph(graph);
                setCounter--;
                return generatorConcept;
            }

            //determine parents below; color parent candidates magenta
            var generatorParents = graph.getOutVertices(generatorConcept);
            if (generatorParents.length !== 0) {
                for (i = 0; i < generatorParents.length; i++) {
                    trackSet(generatorParents[i], {
                        stroke: 'magenta'
                    });
                }
                yield {
                    step: "determine the parents of the new concept by considering the parents of the generator concept",
                    label: "//=GetNewParents",
                    variables: {
                        intent: intent,
                        generatorConcept: generatorConcept.label,
                    }
                };
            }

            //=GetNewParents
            var newParents = [];
            for (i = 0; i < generatorParents.length; i++) {
                var candidate = generatorParents[i];
                //=CreateIntersection
                if (!contains(intent, candidate.intent)) {
                    var intersection = intersect(candidate.intent, intent);
                    yield ({
                        step: "'" + intentLabel(intent) + "' does not contain '" + candidate.label +
                            "', so recursively add their intersection ('" + intentLabel(intersection) + "') to " + candidate.label,
                        label: "//=CreateIntersection",
                        variables: {
                            intent: intentLabel(intent),
                            candidate: candidate.label,
                            intersection: intentLabel(intersection)
                        }
                    });
                    //remove coloring from the old and add to the new candidate
                    undoSet(candidate);

                    candidate =
                        yield * addIntent(intersection, candidate, graph);
                    //highlight the new parent
                    trackSet(candidate, {
                        stroke: 'magenta'
                    });
                    yield ({
                        step: "the returned concept is considered as a possible parent",
                        label: "//=CreateIntersection",
                        variables: {
                            intent: intent,
                            generatorConcept: generatorConcept.label,
                            intersection: intentLabel(intersection)
                        }
                    });
                }
                // add candidate to newParents if it has the maximal intent
                var addParent = true;
                for (j = 0; j < newParents.length; j++) {
                    newParent = newParents[j];
                    if (contains(newParent.intent, candidate.intent)) {
                        //=CandidateSuperceded
                        //don't un-color a parent that was just selected twice
                        if(candidate.intent !== newParent.intent){
                            undoSet(candidate);
                        }
                        yield ({
                            step: "Parent " + newParent.label + " contains parent " + candidate.label + ", so " + candidate.label + " is ignored",
                            label: "//=CandidateSuperceded",
                            variables: {
                                intent: intent,
                                supercedingParent: newParent.label,
                                supercededParent: candidate.label,
                            }
                        });
                        addParent = false;
                        break;
                    } else if (contains(candidate.intent, newParent.intent)) {
                        //=CandidateSupercedes
                        //remove newParent from newParents
                        newParents.splice(j, 1);
                        j--; //so we don't skip something in newParents
                        //don't un-color a parent that was just selected twice
                        if(candidate.intent !== newParent.intent){
                            undoSet(candidate);
                        }
                        yield ({
                            step: "Parent candidate " + candidate.label + " contains parent " + newParent.label + ", so " + newParent.label + " is ignored",
                            label: "//=CandidateSupercedes",
                            variables: {
                                intent: intent,
                                supercedingParent: candidate.label,
                                supercededParent: newParent.label,
                            }
                        });
                    }
                }
                if (addParent) {
                    newParents.push(candidate);
                }
            }
            //=CreateConcept
            var newConcept = graph.addVertex({
                label: intent,
                intent: intent,
                extent: generatorConcept.extent
            });
            _.each(newParents, function(newParent) {
                var edges = graph.getEdges(generatorConcept, newParent);
                if (edges.length === 1) {
                    graph.removeEdge(edges[0]);
                }
                graph.addEdge(newConcept, newParent);
            });
            graph.addEdge(generatorConcept, newConcept);
            layout.update(algo.BOUNDS.inflate(-10, -10));
            yield ({
                step: "Create a new concept with the given intent and extent, and connect it between its generator concept and its parents ",
                label: "//=CreateConcept",
                variables: {
                    intent: newConcept.label,
                    extent: newConcept.extent,
                    generatorConcept: generatorConcept.label,
                    parents: _.map(newParents, function(parent) {
                        return parent.label;
                    }).join(', ') || '(none)'
                }
            });

            // reset the coloring on the getMaximalConcept path
            undoSetGraph(graph);
            setCounter--;
            return newConcept;
        }

        //set the given properties on the given item, but save them so that these changes can be undone.
        //do nothing if the properties are already being saved on this stack level.
        function trackSet(item, props) {
            var savedSettings = {};
            var saveAtt = 'modified' + setCounter;
            item[saveAtt] = item[saveAtt] || {};
            for (var prop in props) {
                if (props.hasOwnProperty(prop)) {
                    //don't write over anything done on this stack level
                    if (item[saveAtt][prop]) {
                        return;
                    }
                    savedSettings[prop] = item.element[prop];
                }
            }
            //combine the new and old saved settings
            for (prop in savedSettings) {
                if (savedSettings.hasOwnProperty(prop)) {
                    item[saveAtt][prop] = savedSettings[prop];
                }
            }
            item.element.set(props);
        }

        //undo the effects of any trackset calls executed on this item during this stack level
        function undoSet(item) {
            if (item.hasOwnProperty('modified' + setCounter)) {
                //undo arg for set was saved in 'modified' attribute
                item.element.set(item['modified' + setCounter]);
                delete item['modified' + setCounter];
            }
        }

        //undo the effects of all trackSet calls executed during this stack level
        function undoSetGraph(graph) {
            _.each(graph.vertices, function(vertex) {
                undoSet(vertex);
            });
            _.each(graph.edges, function(edge) {
                undoSet(edge);
            });
        }


        function highlightInsertPoint(concept) {
            trackSet(concept, {
                strokeWidth: 4,
                stroke: algo.Color.iRED
            });
        }

        //find the maximal concept in the graph that contains the given intent, starting at generatorConcept
        function getMaximalConcept(intent, generatorConcept, graph) {
            var parentIsMaximal = true;
            //we use mark() to color the path from the input generatorConcept to the maximal concept
            mark(generatorConcept);
            while (parentIsMaximal) {
                parentIsMaximal = false;
                var parents = graph.getOutVertices(generatorConcept);
                for (var i = 0; i < parents.length; i++) {
                    var parent = parents[i];
                    if (contains(parent.intent, intent)) {
                        mark(graph.getEdges(generatorConcept, parent)[0]);
                        mark(parent);
                        generatorConcept = parent;
                        parentIsMaximal = true;
                        break;
                    }
                }
            }
            return generatorConcept;
        }

        //mark an item in the path of getMaximalConcept
        function mark(item) {
            var pathColor = 'orange';
            trackSet(item, {
                fill: pathColor
            });
        }

        //check if a string of characters contains all of the characters in another string
        function contains(container, contained) {
            var result = true;
            algo.core.stringToArray(contained).every(function(char) {
                if (container.indexOf(char) === -1) {
                    result = false;
                }
                return result;
            });
            return result;
        }

        function intersect(intent1, intent2) {
            var array1 = algo.core.stringToArray(intent1);
            var array2 = algo.core.stringToArray(intent2);
            var intersection = _.intersection(array1, array2);
            intersection = intersection.sort();
            return intersection.join('');
        }

        function addExtent(extent, vertex, graph) {
            vertex.element.addToExtent(extent);
            highlightInsertPoint(vertex);
            _.each(graph.getOutVertices(vertex), function(parent) {
                addExtent(extent, parent, graph);
                highlightInsertPoint(parent);
            });
        }
    }
    //it's hard to say "add '' to the lattice" everywhere, so use the sign for the empty set when that happens

function intentLabel(intent) {
    return (intent === '' ? '∅' : intent);
}

/**
 * dimensions of concept nodes
 */
var kWIDTH = 60;
var kHEIGHT = 44;
var kFONTSIZE = 18;

/**
 * base class for a concept in a concept lattice. Design is copied from the linked-list demo [here](http://www.algomation.com/algorithm/linked-list-reverse).
 */
var Concept = function(intent, extent) {

    //intent and extent are strings; each character represents one thing.
    //intent is the set of attributes, extent is the contents of the concept.
    this.intent = intent;
    this.extent = extent;
    this.label = intentLabel(intent);

    //progenitor initialization; we are a blue, rounded rectangle.
    algo.render.Rectangle.call(this, {
        w: kWIDTH,
        h: kHEIGHT,
        strokeWidth: 2,
        stroke: algo.Color.iBLUE,
        fill: algo.Color.iWHITE,
        pen: algo.Color.iBLUE,
        cornerRadius: kHEIGHT >> 3
    });

    // create our intent element that displays the intent of this item

    this.intentElement = new algo.render.Rectangle({
        parent: this,
        x: 0,
        y: 0,
        w: kWIDTH - 1,
        h: (kHEIGHT >> 1) - 7,
        text: this.label,
        strokeWidth: 0,
        fill: 'transparent',
        fontSize: kFONTSIZE
    });

    // create a line to separate intent from extent

    this.hdivide = new algo.render.Line({
        parent: this,
        x1: 0,
        y1: kHEIGHT >> 1,
        x2: kWIDTH,
        y2: kHEIGHT >> 1,
        thickness: 2,
        fill: algo.Color.iBLUE
    });

    // create another rectangle to hold the extent

    this.extentElement = new algo.render.Rectangle({
        parent: this,
        x: 0,
        y: this.hdivide.y1 + 1,
        w: kWIDTH - 1,
        h: (kHEIGHT >> 1) - 7,
        text: this.extent,
        strokeWidth: 0,
        fill: 'transparent',
        fontSize: kFONTSIZE
    });

    this.updateWidth();
};

algo.core.extends(algo.render.Rectangle, Concept);

//temporary hack to make sure nodes are big enough to fit contained text 
Concept.prototype.updateWidth = function() {
    var width = this.getWidth();
    this.set({
        w: width
    });
    this.intentElement.set({
        w: width
    });
    this.hdivide.set({
        x2: width
    });
    this.extentElement.set({
        w: width
    });
};

Concept.prototype.getWidth = function() {
    var maxLength = this.intent.length;
    if (this.extent.length > maxLength) {
        maxLength = this.extent.length;
    }
    //default kWIDTH comfortably holds 5 characters. Add another 10 for each character over that, and add some padding, as well.
    if (maxLength > 5) {
        return maxLength * 10 + 5;
    }
    return kWIDTH;
};

Concept.prototype.addToExtent = function(newExtent) {
    var array1 = algo.core.stringToArray(this.extent);
    var array2 = algo.core.stringToArray(newExtent);
    var union = _.union(array1, array2);
    union = union.sort();
    this.extent = union.join('');
    this.extentElement.set({
        text: this.extent
    });
    this.updateWidth();
};

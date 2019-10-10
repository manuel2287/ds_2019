"use strict";

function treeBoxes(urlService, jsonData)
{
	var urlService_ = '';

	var blue = '#337ab7',
		green = '#5cb85c',
		red = '#bd5734';

	var margin = {
					top : 0,
					right : 0,
					bottom : 100,
					left : 0
				 },
    // La altura y el ancho se redefinen posteriormente en función del tamaño del árbol
    // (después de eso se cargan los datos)
		width = 960 - margin.right - margin.left,
		height = 800 - margin.top - margin.bottom;

	var rectNode = { width : 150, height : 100, textMargin : 5 },
		tooltip = { width : 150, height : 40, textMargin : 5 };
	var i = 0,
		duration = 750,
		root;

	var mousedown; // Use para guardar temporalmente el valor 'mousedown.zoom'
	var mouseWheel,
		mouseWheelName,
		isKeydownZoom = false;

	var tree;
	var baseSvg,
		svgGroup,
		nodeGroup,  //Si los nodos no están agrupados, después de un clic, el nodo svg se configurará después de su información sobre herramientas correspondiente y lo ocultará
		nodeGroupTooltip,
		linkGroup,
		linkGroupToolTip,
		defs;

	init(urlService, jsonData);

	function init(urlService, jsonData)
	{
		urlService_ = urlService;
		if (urlService && urlService.length > 0)
		{
			if (urlService.charAt(urlService.length - 1) != '/')
				urlService_ += '/';
		}

		if (jsonData)
			drawTree(jsonData);
		else
		{
			console.error(jsonData);
			alert('Datos inválidos!');
		}
	}

	function drawTree(jsonData)
	{
		tree = d3.layout.tree().size([ height, width ]);
		root = jsonData;
		root.fixed = true;

    // Establecer dinámicamente la altura del contenedor svg principal
    // breadthFirstTraversal devuelve el número máximo de nodos en un mismo nivel y colorea los nodos
		var maxDepth = 0;
		var maxTreeWidth = breadthFirstTraversal(tree.nodes(root), function(currentLevel) {
			maxDepth++;
			currentLevel.forEach(function(node) {
				if (node.esHoja == false){
					node.color = blue}
					else{
                        if (node.esHoja == true & node.esHojaPura==true){
                            node.color = green;
                        }else{
                            node.color = red;
                        }
				    }
				});
			});
		height = maxTreeWidth * (rectNode.height + 20) + tooltip.height + 20 - margin.right - margin.left;
		width = maxDepth * (rectNode.width * 1.5) + tooltip.width / 2 - margin.top - margin.bottom;

		tree = d3.layout.tree().size([ height, width ]);
		root.x0 = height / 2;
		root.y0 = 0;

		baseSvg = d3.select('#tree-container').append('svg')
	    .attr('width', width + margin.right + margin.left)
		.attr('height', height + margin.top + margin.bottom)
		.attr('class', 'svgContainer')
		.call(d3.behavior.zoom()
		      //.scaleExtent([0.5, 1.5]) // Limitar la escala de zoom
		      .on('zoom', zoomAndDrag));

		// La rueda del ratón se desactiva; de lo contrario, después de un primer arrastre del árbol, el evento wheel arrastra el árbol (en lugar de desplazarse por la ventana)
		getMouseWheelEvent();
		d3.select('#tree-container').select('svg').on(mouseWheelName, null);
		d3.select('#tree-container').select('svg').on('dblclick.zoom', null);

		svgGroup = baseSvg.append('g')
		.attr('class','drawarea')
		.append('g')
		.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    // Los elementos SVG en nodeGroupTooltip podrían estar asociados con nodeGroup,
    // lo mismo para linkGroupToolTip y linkGroup,
    // pero esta separación permite gestionar el orden en el que se dibujan los elementos
    // y así, la información sobre herramientas siempre está en la parte superior.
		nodeGroup = svgGroup.append('g')
					.attr('id', 'nodes');
		linkGroup = svgGroup.append('g')
					.attr('id', 'links');
		linkGroupToolTip = svgGroup.append('g')
			   				.attr('id', 'linksTooltips');
		nodeGroupTooltip = svgGroup.append('g')
			   				.attr('id', 'nodesTooltips');

		defs = baseSvg.append('defs');
		initArrowDef();
		initDropShadow();

		update(root);
	}

	function update(source)
	{
		// Calcular el nuevo diseño del árbol
		var nodes = tree.nodes(root).reverse(),
			links = tree.links(nodes);

		// Comprueba si dos nodos están en colisión en las ejes de ordenadas y muévalos
		breadthFirstTraversal(tree.nodes(root), collision);
		// Normalizar para profundidad fija
		nodes.forEach(function(d) {
			d.y = d.depth * (rectNode.width * 1.5);
		});

	// 1) ******************* Actualizar nodos *******************
		var node = nodeGroup.selectAll('g.node').data(nodes, function(d) {
			return d.id || (d.id = ++i);
		});
		var nodesTooltip = nodeGroupTooltip.selectAll('g').data(nodes, function(d) {
			return d.id || (d.id = ++i);
		});

    // Ingrese cualquier nuevo nodo en la posición anterior del padre
    // Usamos "insertar" en lugar de "agregar", por lo que cuando se agrega un nuevo nodo secundario (después de un clic)
    // se agrega en la parte superior del grupo, por lo que se dibuja primero
    // de lo contrario, la información sobre herramientas de los nodos se dibuja antes de sus nodos secundarios y
    // esconderlos
		var nodeEnter = node.enter().insert('g', 'g.node')
		.attr('class', 'node')
		.attr('transform', function(d) {
			  return 'translate(' + source.y0 + ',' + source.x0 + ')'; })
		.on('click', function(d) {
						click(d);
			});
		var nodeEnterTooltip = nodesTooltip.enter().append('g')
			.attr('transform', function(d) {
				  return 'translate(' + source.y0 + ',' + source.x0 + ')'; });

		nodeEnter.append('g').append('rect')
		.attr('rx', 6)
		.attr('ry', 6)
		.attr('width', rectNode.width)
		.attr('height', rectNode.height)
		.attr('class', 'node-rect')
		.attr('fill', function (d) { return d.color; })
		.attr('filter', 'url(#drop-shadow)');

		nodeEnter.append('foreignObject')
		.attr('x', rectNode.textMargin)
		.attr('y', rectNode.textMargin)
		.attr('width', function() {
					return (rectNode.width - rectNode.textMargin * 2) < 0 ? 0
							: (rectNode.width - rectNode.textMargin * 2)
				})
		.attr('height', function() {
					return (rectNode.height - rectNode.textMargin * 2) < 0 ? 0
							: (rectNode.height - rectNode.textMargin * 2)
				})

		.append('xhtml').html(function(d) {
                    var nombre ='',
                        limite= -1,
                        total = 0,
                        tot= 0;
		            if (d.esHoja == true){
//		                console.log(d);
//		                console.log("esHoja");
		                nombre=  '<b>NODO HOJA</b><br><br>';
		                limite = '';
		                total = '<b>Total: </b>' + d.datos[0].total.toString() + '<br>'
		            }else{
		                nombre=  '<b>ATRIBUTO - ' + d.nombre + '</b><br><br>';
		                limite = '<b>Valor Límite: </b>' + d.limite.toFixed(2).toString() + '<br>';
		                tot = d.datos[0].total + d.datos[1].total;
		                total = '<b>Total: </b>' + tot.toString() + '<br>';
		            };

		            var clases='';
                    d.clases.forEach(function(item) {
                        var claves=Object.keys(item);
                        clases+= claves[0]+':'+item[claves[0]].toString()+' Porc:'+item.porcentaje.toFixed(2).toString()+'%;<br>';
                    });

					return '<div style="width: '
							+ (rectNode.width - rectNode.textMargin * 2) + 'px; height: '
							+ (rectNode.height - rectNode.textMargin * 2) + 'px;" class="node-text wordwrap">'
							+ nombre
							+ limite
							+ total
							+ '<b>Clases: </b>'+clases
							+ '</div>';
				})
		.on('mouseover', function(d) {
			$('#nodeInfoID' + d.id).css('visibility', 'visible');
			$('#nodeInfoTextID' + d.id).css('visibility', 'visible');
		})
		.on('mouseout', function(d) {
			$('#nodeInfoID' + d.id).css('visibility', 'hidden');
			$('#nodeInfoTextID' + d.id).css('visibility', 'hidden');
		});

		nodeEnterTooltip.append("rect")
		.attr('id', function(d) { return 'nodeInfoID' + d.id; })
    	.attr('x', rectNode.width / 2)
		.attr('y', rectNode.height / 2)
		.attr('width', tooltip.width)
		.attr('height', tooltip.height)
    	.attr('class', 'tooltip-box')
    	.style('fill-opacity', 0.8)
		.on('mouseover', function(d) {
			$('#nodeInfoID' + d.id).css('visibility', 'visible');
			$('#nodeInfoTextID' + d.id).css('visibility', 'visible');
			removeMouseEvents();
		})
		.on('mouseout', function(d) {
			$('#nodeInfoID' + d.id).css('visibility', 'hidden');
			$('#nodeInfoTextID' + d.id).css('visibility', 'hidden');
			reactivateMouseEvents();
		});

		nodeEnterTooltip.append("text")
		.attr('id', function(d) { return 'nodeInfoTextID' + d.id; })
    	.attr('x', rectNode.width / 2 + tooltip.textMargin)
		.attr('y', rectNode.height / 2 + tooltip.textMargin * 2)
		.attr('width', tooltip.width)
		.attr('height', tooltip.height)
		.attr('class', 'tooltip-text')
		.style('fill', 'white')
		.append("tspan")
	    .text(function(d) {
	        if (d.esHoja){return "NODO HOJA"}else{
	        return "División por: "+d.nombre
	        }
	                })
	    .append("tspan")
	    .attr('x', rectNode.width / 2 + tooltip.textMargin)
	    .attr('dy', '1.5em')
	    .text(function(d) {if (d.impureza != null){
	        var sal='';
	        console.log(d.impureza[''])
                if (d.impureza["tasa de ganancia"]){
                    console.log(d.impureza.ganancia);
                    return "Tasa de ganancia: "+d.impureza["tasa de ganancia"].toFixed(2)
                    }else{
                    console.log(d.impureza.ganancia)
                    return "Ganancia: "+d.impureza.ganancia.toFixed(2)
                    };
	        }else{
	        return ''}
	        });

		// Transición de los nodos a su nueva posición.
		var nodeUpdate = node.transition().duration(duration)
		.attr('transform', function(d) { return 'translate(' + d.y + ',' + d.x + ')'; });
		nodesTooltip.transition().duration(duration)
		.attr('transform', function(d) { return 'translate(' + d.y + ',' + d.x + ')'; });

		nodeUpdate.select('rect')
		.attr('class', function(d) { return d._children ? 'node-rect-closed' : 'node-rect'; });

		nodeUpdate.select('text').style('fill-opacity', 1);

		// Transición saliendo de los nodos a la nueva posición del padre
		var nodeExit = node.exit().transition().duration(duration)
			.attr('transform', function(d) { return 'translate(' + source.y + ',' + source.x + ')'; })
			.remove();
		nodesTooltip.exit().transition().duration(duration)
			.attr('transform', function(d) { return 'translate(' + source.y + ',' + source.x + ')'; })
		.remove();

		nodeExit.select('text').style('fill-opacity', 1e-6);


	// 2) ******************* Actualizar enlaces *******************
		var link = linkGroup.selectAll('path').data(links, function(d) {
			return d.target.id;
		});
		var linkTooltip = linkGroupToolTip.selectAll('g').data(links, function(d) {
			return d.target.id;
		});

		d3.selection.prototype.moveToFront = function() {
			  return this.each(function(){
				    this.parentNode.appendChild(this);
				  });
			};

        // Ingrese cualquier enlace nuevo en la posición anterior del padre.

			var linkenter = link.enter().insert('path', 'g')
			.attr('class', 'link')
			.attr('id', function(d) { return 'linkID' + d.target.id; })
			.attr('d', function(d) { return diagonal(d); })
			.attr('marker-end', 'url(#end-arrow)')
			.attr('marker-start', function(d) { return ''; })
			.on('mouseover', function(d) {
				d3.select(this).moveToFront();

				d3.select(this).attr('marker-end', 'url(#end-arrow-selected)');
				d3.select(this).attr('marker-start', '');
				d3.select(this).attr('class', 'linkselected');

				$('#tooltipLinkID' + d.target.id).attr('x', (d.target.y + rectNode.width - d.source.y) / 2 + d.source.y);
				$('#tooltipLinkID' + d.target.id).attr('y', (d.target.x - d.source.x) / 2 + d.source.x);
				$('#tooltipLinkID' + d.target.id).css('visibility', 'visible');
				$('#tooltipLinkTextID' + d.target.id).css('visibility', 'visible');
			})
			.on('mouseout', function(d) {
				d3.select(this).attr('marker-end', 'url(#end-arrow)');
				d3.select(this).attr('marker-start', '');
				d3.select(this).attr('class', 'link');
				$('#tooltipLinkID' + d.target.id).css('visibility', 'hidden');
				$('#tooltipLinkTextID' + d.target.id).css('visibility', 'hidden');
			});

			linkTooltip.enter().append('rect')
			.attr('id', function(d) { return 'tooltipLinkID' + d.target.id; })
			.attr('class', 'tooltip-box')
			.style('fill-opacity', 0.8)
			.attr('x', function(d) { return (d.target.y + rectNode.width - d.source.y) / 2 + d.source.y; })
			.attr('y', function(d) { return (d.target.x - d.source.x) / 2 + d.source.x; })
			.attr('width', tooltip.width)
			.attr('height', tooltip.height)
			.on('mouseover', function(d) {
				$('#tooltipLinkID' + d.target.id).css('visibility', 'visible');
				$('#tooltipLinkTextID' + d.target.id).css('visibility', 'visible');
				// Después de seleccionar un enlace, el cursor puede situarse sobre la información sobre herramientas, por eso aún tenemos que resaltar el enlace y la flecha.
				$('#linkID' + d.target.id).attr('class', 'linkselected');
				$('#linkID' + d.target.id).attr('marker-end', 'url(#end-arrow-selected)');
				$('#linkID' + d.target.id).attr('marker-start', '');

				removeMouseEvents();
			})
			.on('mouseout', function(d) {
				$('#tooltipLinkID' + d.target.id).css('visibility', 'hidden');
				$('#tooltipLinkTextID' + d.target.id).css('visibility', 'hidden');
				$('#linkID' + d.target.id).attr('class', 'link');
				$('#linkID' + d.target.id).attr('marker-end', 'url(#end-arrow)');
				$('#linkID' + d.target.id).attr('marker-start', '');

				reactivateMouseEvents();
			});

			linkTooltip.enter().append('text')
			.attr('id', function(d) { return 'tooltipLinkTextID' + d.target.id; })
			.attr('class', 'tooltip-text')
			.attr('x', function(d) { return (d.target.y + rectNode.width - d.source.y) / 2 + d.source.y + tooltip.textMargin; })
			.attr('y', function(d) { return (d.target.x - d.source.x) / 2 + d.source.x + tooltip.textMargin * 2; })
			.attr('width', tooltip.width)
			.attr('height', tooltip.height)
			.style('fill', 'white')
			.append("tspan")
	   		.text(function(d) {return "Por rama: "+d.target.link.valor+d.target.link.limite.toFixed(2).toString();})
//	   		.append("tspan")
//	    	.attr('x', function(d) { return (d.target.y + rectNode.width - d.source.y) / 2 + d.source.y + tooltip.textMargin; })
//	   		.attr('dy', '1.5em')
//	    	.text(function(d) {return 'algo mas...'});

		// Enlaces de transición a su nueva posición.
		var linkUpdate = link.transition().duration(duration)
						 	 .attr('d', function(d) { return diagonal(d); });
		linkTooltip.transition().duration(duration)
				   .attr('d', function(d) { return diagonal(d); });

		// Transición de los nodos que salen a la nueva posición del padre.
		link.exit().transition()
		.remove();

		linkTooltip.exit().transition()
			.remove();

		// Guarda las viejas posiciones para la transición.
		nodes.forEach(function(d) {
			d.x0 = d.x;
			d.y0 = d.y;
		});
	}

	// La FUNCIONALIDAD DE ZOOM DESACTIVADA!(puede usar el atajo del cursor Ctrl + de la rueda del mouse)
	function zoomAndDrag() {
	    var scale = 1,
	        translation = d3.event.translate,
	        tbound = -height * scale,
	        bbound = height * scale,
	        lbound = (-width + margin.right) * scale,
	        rbound = (width - margin.left) * scale;
	    // limitar la traducción a los umbrales
	    translation = [
	        Math.max(Math.min(translation[0], rbound), lbound),
	        Math.max(Math.min(translation[1], bbound), tbound)
	    ];
	    d3.select('.drawarea')
	        .attr('transform', 'translate(' + translation + ')' +
	              ' scale(' + scale + ')');
	}

	// Alternar hijos al hacer clic.
	function click(d) {
		if (d.children) {
			d._children = d.children;
			d.children = null;
		} else {
			d.children = d._children;
			d._children = null;
		}
		update(d);
	}

    // Ancho de la travesía del árbol. La función func se procesa en cada nodo de un mismo nivel.
    // devolver el nivel máximo
	  function breadthFirstTraversal(tree, func)
	  {
		  var max = 0;
		  if (tree && tree.length > 0)
		  {
			  var currentDepth = tree[0].depth;
			  var fifo = [];
			  var currentLevel = [];

			  fifo.push(tree[0]);
			  while (fifo.length > 0) {
				  var node = fifo.shift();
				  if (node.depth > currentDepth) {
					  func(currentLevel);
					  currentDepth++;
					  max = Math.max(max, currentLevel.length);
					  currentLevel = [];
				  }
				  currentLevel.push(node);
				  if (node.children) {
					  for (var j = 0; j < node.children.length; j++) {
						  fifo.push(node.children[j]);
					  }
				  }
		  	}
			func(currentLevel);
			return Math.max(max, currentLevel.length);
		}
		return 0;
	  }

	// x = ordenadas,  y = abscisas
	function collision(siblings) {
	  var minPadding = 5;
	  if (siblings) {
		  for (var i = 0; i < siblings.length - 1; i++)
		  {
			  if (siblings[i + 1].x - (siblings[i].x + rectNode.height) < minPadding)
				  siblings[i + 1].x = siblings[i].x + rectNode.height + minPadding;
		  }
	  }
	}

	function removeMouseEvents() {
		// Los comportamientos de arrastre y zoom están deshabilitados temporalmente, por lo que se puede seleccionar el texto de información sobre herramientas
		mousedown = d3.select('#tree-container').select('svg').on('mousedown.zoom');
		d3.select('#tree-container').select('svg').on("mousedown.zoom", null);
	}

	function reactivateMouseEvents() {
		// Reactivar los comportamientos de arrastre y zoom.
		d3.select('#tree-container').select('svg').on('mousedown.zoom', mousedown);
	}

	// El nombre del evento depende del navegador.
	function getMouseWheelEvent() {
		if (d3.select('#tree-container').select('svg').on('wheel.zoom'))
		{
			mouseWheelName = 'wheel.zoom';
			return d3.select('#tree-container').select('svg').on('wheel.zoom');
		}
		if (d3.select('#tree-container').select('svg').on('mousewheel.zoom') != null)
		{
			mouseWheelName = 'mousewheel.zoom';
			return d3.select('#tree-container').select('svg').on('mousewheel.zoom');
		}
		if (d3.select('#tree-container').select('svg').on('DOMMouseScroll.zoom'))
		{
			mouseWheelName = 'DOMMouseScroll.zoom';
			return d3.select('#tree-container').select('svg').on('DOMMouseScroll.zoom');
		}
	}

	function diagonal(d) {
		var p0 = {
			x : d.source.x + rectNode.height / 2,
			y : (d.source.y + rectNode.width)
		}, p3 = {
			x : d.target.x + rectNode.height / 2,
			y : d.target.y  - 12
		}, m = (p0.y + p3.y) / 2, p = [ p0, {
			x : p0.x,
			y : m
		}, {
			x : p3.x,
			y : m
		}, p3 ];
		p = p.map(function(d) {
			return [ d.y, d.x ];
		});
		return 'M' + p[0] + 'C' + p[1] + ' ' + p[2] + ' ' + p[3];
	}

	function initDropShadow() {
		var filter = defs.append("filter")
		    .attr("id", "drop-shadow")
		    .attr("color-interpolation-filters", "sRGB");

		filter.append("feOffset")
		.attr("result", "offOut")
		.attr("in", "SourceGraphic")
	    .attr("dx", 0)
	    .attr("dy", 0);

		filter.append("feGaussianBlur")
		    .attr("stdDeviation", 2);

		filter.append("feOffset")
		    .attr("dx", 2)
		    .attr("dy", 2)
		    .attr("result", "shadow");

		filter.append("feComposite")
	    .attr("in", 'offOut')
	    .attr("in2", 'shadow')
	    .attr("operator", "over");
	}

	function initArrowDef() {
    // Construye las definiciones de flechas
    // flecha de finalización
		defs.append('marker')
		.attr('id', 'end-arrow')
		.attr('viewBox', '0 -5 10 10')
		.attr('refX', 0)
		.attr('refY', 0)
		.attr('markerWidth', 6)
		.attr('markerHeight', 6)
		.attr('orient', 'auto')
		.attr('class', 'arrow')
		.append('path')
		.attr('d', 'M0,-5L10,0L0,5');

		// flecha final seleccionada
		defs.append('marker')
		.attr('id', 'end-arrow-selected')
		.attr('viewBox', '0 -5 10 10')
		.attr('refX', 0)
		.attr('refY', 0)
		.attr('markerWidth', 6)
		.attr('markerHeight', 6)
		.attr('orient', 'auto')
		.attr('class', 'arrowselected')
		.append('path')
		.attr('d', 'M0,-5L10,0L0,5');

		// flecha de inicio
		defs.append('marker')
		.attr('id', 'start-arrow')
		.attr('viewBox', '0 -5 10 10')
		.attr('refX', 0)
		.attr('refY', 0)
		.attr('markerWidth', 6)
		.attr('markerHeight', 6)
		.attr('orient', 'auto')
		.attr('class', 'arrow')
		.append('path')
		.attr('d', 'M10,-5L0,0L10,5');

		// flecha de inicio seleccionada
		defs.append('marker')
		.attr('id', 'start-arrow-selected')
		.attr('viewBox', '0 -5 10 10')
		.attr('refX', 0)
		.attr('refY', 0)
		.attr('markerWidth', 6)
		.attr('markerHeight', 6)
		.attr('orient', 'auto')
		.attr('class', 'arrowselected')
		.append('path')
		.attr('d', 'M10,-5L0,0L10,5');
	}
}
var app = (function () {
	'use strict';

	function noop() {}

	function assign(tar, src) {
		for (var k in src) tar[k] = src[k];
		return tar;
	}

	function assignTrue(tar, src) {
		for (var k in src) tar[k] = 1;
		return tar;
	}

	function callAfter(fn, i) {
		if (i === 0) fn();
		return () => {
			if (!--i) fn();
		};
	}

	function addLoc(element, file, line, column, char) {
		element.__svelte_meta = {
			loc: { file, line, column, char }
		};
	}

	function run(fn) {
		fn();
	}

	function append(target, node) {
		target.appendChild(node);
	}

	function insert(target, node, anchor) {
		target.insertBefore(node, anchor);
	}

	function detachNode(node) {
		node.parentNode.removeChild(node);
	}

	function reinsertChildren(parent, target) {
		while (parent.firstChild) target.appendChild(parent.firstChild);
	}

	function createFragment() {
		return document.createDocumentFragment();
	}

	function createElement(name) {
		return document.createElement(name);
	}

	function createText(data) {
		return document.createTextNode(data);
	}

	function createComment() {
		return document.createComment('');
	}

	function addListener(node, event, handler, options) {
		node.addEventListener(event, handler, options);
	}

	function removeListener(node, event, handler, options) {
		node.removeEventListener(event, handler, options);
	}

	function setAttribute(node, attribute, value) {
		if (value == null) node.removeAttribute(attribute);
		else node.setAttribute(attribute, value);
	}

	function setData(text, data) {
		text.data = '' + data;
	}

	function setStyle(node, key, value) {
		node.style.setProperty(key, value);
	}

	function blankObject() {
		return Object.create(null);
	}

	function destroy(detach) {
		this.destroy = noop;
		this.fire('destroy');
		this.set = noop;

		this._fragment.d(detach !== false);
		this._fragment = null;
		this._state = {};
	}

	function destroyDev(detach) {
		destroy.call(this, detach);
		this.destroy = function() {
			console.warn('Component was already destroyed');
		};
	}

	function _differs(a, b) {
		return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
	}

	function fire(eventName, data) {
		var handlers =
			eventName in this._handlers && this._handlers[eventName].slice();
		if (!handlers) return;

		for (var i = 0; i < handlers.length; i += 1) {
			var handler = handlers[i];

			if (!handler.__calling) {
				try {
					handler.__calling = true;
					handler.call(this, data);
				} finally {
					handler.__calling = false;
				}
			}
		}
	}

	function flush(component) {
		component._lock = true;
		callAll(component._beforecreate);
		callAll(component._oncreate);
		callAll(component._aftercreate);
		component._lock = false;
	}

	function get() {
		return this._state;
	}

	function init(component, options) {
		component._handlers = blankObject();
		component._slots = blankObject();
		component._bind = options._bind;
		component._staged = {};

		component.options = options;
		component.root = options.root || component;
		component.store = options.store || component.root.store;

		if (!options.root) {
			component._beforecreate = [];
			component._oncreate = [];
			component._aftercreate = [];
		}
	}

	function on(eventName, handler) {
		var handlers = this._handlers[eventName] || (this._handlers[eventName] = []);
		handlers.push(handler);

		return {
			cancel: function() {
				var index = handlers.indexOf(handler);
				if (~index) handlers.splice(index, 1);
			}
		};
	}

	function set(newState) {
		this._set(assign({}, newState));
		if (this.root._lock) return;
		flush(this.root);
	}

	function _set(newState) {
		var oldState = this._state,
			changed = {},
			dirty = false;

		newState = assign(this._staged, newState);
		this._staged = {};

		for (var key in newState) {
			if (this._differs(newState[key], oldState[key])) changed[key] = dirty = true;
		}
		if (!dirty) return;

		this._state = assign(assign({}, oldState), newState);
		this._recompute(changed, this._state);
		if (this._bind) this._bind(changed, this._state);

		if (this._fragment) {
			this.fire("state", { changed: changed, current: this._state, previous: oldState });
			this._fragment.p(changed, this._state);
			this.fire("update", { changed: changed, current: this._state, previous: oldState });
		}
	}

	function _stage(newState) {
		assign(this._staged, newState);
	}

	function setDev(newState) {
		if (typeof newState !== 'object') {
			throw new Error(
				this._debugName + '.set was called without an object of data key-values to update.'
			);
		}

		this._checkReadOnly(newState);
		set.call(this, newState);
	}

	function callAll(fns) {
		while (fns && fns.length) fns.shift()();
	}

	function _mount(target, anchor) {
		this._fragment[this._fragment.i ? 'i' : 'm'](target, anchor || null);
	}

	var protoDev = {
		destroy: destroyDev,
		get,
		fire,
		on,
		set: setDev,
		_recompute: noop,
		_set,
		_stage,
		_mount,
		_differs
	};

	/* ui\tags\Loading.html generated by Svelte v2.16.1 */

	function data(e) {
		return {small: false, big: false};
	}

	const file = "ui\\tags\\Loading.html";

	function create_main_fragment(component, ctx) {
		var div8, div7, div6, div1, div0, text0, div3, div2, text1, div5, div4, div7_class_value, current;

		return {
			c: function create() {
				div8 = createElement("div");
				div7 = createElement("div");
				div6 = createElement("div");
				div1 = createElement("div");
				div0 = createElement("div");
				text0 = createText("\r\n        ");
				div3 = createElement("div");
				div2 = createElement("div");
				text1 = createText("\r\n        ");
				div5 = createElement("div");
				div4 = createElement("div");
				div0.className = "circle";
				addLoc(div0, file, 4, 12, 246);
				div1.className = "circle-clipper left";
				addLoc(div1, file, 3, 8, 199);
				div2.className = "circle";
				addLoc(div2, file, 6, 12, 325);
				div3.className = "gap-patch";
				addLoc(div3, file, 5, 14, 288);
				div4.className = "circle";
				addLoc(div4, file, 8, 12, 415);
				div5.className = "circle-clipper right";
				addLoc(div5, file, 7, 14, 367);
				div6.className = "spinner-layer spinner-yellow-only";
				addLoc(div6, file, 2, 8, 142);
				div7.className = div7_class_value = "preloader-wrapper " + (ctx.small ? "small" : ctx.big ? "big" : "") + " active";
				addLoc(div7, file, 1, 4, 57);
				div8.className = "center-align";
				setStyle(div8, "padding-top", "25%");
				addLoc(div8, file, 0, 0, 0);
			},

			m: function mount(target, anchor) {
				insert(target, div8, anchor);
				append(div8, div7);
				append(div7, div6);
				append(div6, div1);
				append(div1, div0);
				append(div1, text0);
				append(div6, div3);
				append(div3, div2);
				append(div3, text1);
				append(div6, div5);
				append(div5, div4);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.small || changed.big) && div7_class_value !== (div7_class_value = "preloader-wrapper " + (ctx.small ? "small" : ctx.big ? "big" : "") + " active")) {
					div7.className = div7_class_value;
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div8);
				}
			}
		};
	}

	function Loading(options) {
		this._debugName = '<Loading>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data(), options.data);
		if (!('small' in this._state)) console.warn("<Loading> was created without expected data property 'small'");
		if (!('big' in this._state)) console.warn("<Loading> was created without expected data property 'big'");
		this._intro = !!options.intro;

		this._fragment = create_main_fragment(this, this._state);

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);
		}

		this._intro = true;
	}

	assign(Loading.prototype, protoDev);

	Loading.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\tags\Imgl.html generated by Svelte v2.16.1 */

	function data$1() {
		return {
	    done: false,
	    src: '',
	    alt: '',
	    class: '',
	    style: '',
	    id: ''
	};
	}

	function oncreate() {
	    const {src} = this.get();
	    if(src != null && src != '') {
	        const img = new Image();
	        img.src = src;
	        img.onload = e => {
	            this.set({done: true});
	            this.fire("load");
	        };
	    }
	}
	const file$1 = "ui\\tags\\Imgl.html";

	function create_main_fragment$1(component, ctx) {
		var current_block_type_index, if_block, if_block_anchor, current;

		var if_block_creators = [
			create_if_block,
			create_else_block
		];

		var if_blocks = [];

		function select_block_type(ctx) {
			if (!ctx.done) return 0;
			return 1;
		}

		current_block_type_index = select_block_type(ctx);
		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](component, ctx);

		return {
			c: function create() {
				if_block.c();
				if_block_anchor = createComment();
			},

			m: function mount(target, anchor) {
				if_blocks[current_block_type_index].m(target, anchor);
				insert(target, if_block_anchor, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				var previous_block_index = current_block_type_index;
				current_block_type_index = select_block_type(ctx);
				if (current_block_type_index === previous_block_index) {
					if_blocks[current_block_type_index].p(changed, ctx);
				} else {
					if_block.o(function() {
						if_blocks[previous_block_index].d(1);
						if_blocks[previous_block_index] = null;
					});

					if_block = if_blocks[current_block_type_index];
					if (!if_block) {
						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](component, ctx);
						if_block.c();
					}
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				if (if_block) if_block.o(outrocallback);
				else outrocallback();

				current = false;
			},

			d: function destroy$$1(detach) {
				if_blocks[current_block_type_index].d(detach);
				if (detach) {
					detachNode(if_block_anchor);
				}
			}
		};
	}

	// (3:0) {:else}
	function create_else_block(component, ctx) {
		var img, current;

		return {
			c: function create() {
				img = createElement("img");
				img.className = ctx.class;
				img.style.cssText = ctx.style;
				img.id = ctx.id;
				img.src = ctx.src;
				img.alt = ctx.alt;
				addLoc(img, file$1, 3, 4, 48);
			},

			m: function mount(target, anchor) {
				insert(target, img, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				if (changed.class) {
					img.className = ctx.class;
				}

				if (changed.style) {
					img.style.cssText = ctx.style;
				}

				if (changed.id) {
					img.id = ctx.id;
				}

				if (changed.src) {
					img.src = ctx.src;
				}

				if (changed.alt) {
					img.alt = ctx.alt;
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(img);
				}
			}
		};
	}

	// (1:0) {#if !done}
	function create_if_block(component, ctx) {
		var current;

		var loading_initial_data = { small: true };
		var loading = new Loading({
			root: component.root,
			store: component.store,
			data: loading_initial_data
		});

		return {
			c: function create() {
				loading._fragment.c();
			},

			m: function mount(target, anchor) {
				loading._mount(target, anchor);
				current = true;
			},

			p: noop,

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				if (loading) loading._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				loading.destroy(detach);
			}
		};
	}

	function Imgl(options) {
		this._debugName = '<Imgl>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data$1(), options.data);
		if (!('done' in this._state)) console.warn("<Imgl> was created without expected data property 'done'");
		if (!('class' in this._state)) console.warn("<Imgl> was created without expected data property 'class'");
		if (!('style' in this._state)) console.warn("<Imgl> was created without expected data property 'style'");
		if (!('id' in this._state)) console.warn("<Imgl> was created without expected data property 'id'");
		if (!('src' in this._state)) console.warn("<Imgl> was created without expected data property 'src'");
		if (!('alt' in this._state)) console.warn("<Imgl> was created without expected data property 'alt'");
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$1(this, this._state);

		this.root._oncreate.push(() => {
			oncreate.call(this);
			this.fire("update", { changed: assignTrue({}, this._state), current: this._state });
		});

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}

		this._intro = true;
	}

	assign(Imgl.prototype, protoDev);

	Imgl.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\tags\Card.html generated by Svelte v2.16.1 */

	function data$2() {
	    return {
	        col: null,
	        image: null,
	        alt: '',
	        static: false,
	    }
	}
	const file$2 = "ui\\tags\\Card.html";

	function create_main_fragment$2(component, ctx) {
		var div1, text, div0, slot_content_default = component._slotted.default, div1_class_value, current;

		var if_block = (ctx.image) && create_if_block$1(component, ctx);

		return {
			c: function create() {
				div1 = createElement("div");
				if (if_block) if_block.c();
				text = createText("\r\n\t");
				div0 = createElement("div");
				div0.className = "card-content";
				addLoc(div0, file$2, 15, 1, 438);
				div1.className = div1_class_value = "card white " + (ctx.static ? "z-depth-3" : "hoverable") + " " + (ctx.col ? "col" : "") + " " + ctx.col;
				addLoc(div1, file$2, 9, 0, 229);
			},

			m: function mount(target, anchor) {
				insert(target, div1, anchor);
				if (if_block) if_block.m(div1, null);
				append(div1, text);
				append(div1, div0);

				if (slot_content_default) {
					append(div0, slot_content_default);
				}

				current = true;
			},

			p: function update(changed, ctx) {
				if (ctx.image) {
					if (if_block) {
						if_block.p(changed, ctx);
					} else {
						if_block = create_if_block$1(component, ctx);
						if (if_block) if_block.c();
					}

					if_block.i(div1, text);
				} else if (if_block) {
					if_block.o(function() {
						if_block.d(1);
						if_block = null;
					});
				}

				if ((!current || changed.static || changed.col) && div1_class_value !== (div1_class_value = "card white " + (ctx.static ? "z-depth-3" : "hoverable") + " " + (ctx.col ? "col" : "") + " " + ctx.col)) {
					div1.className = div1_class_value;
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				if (if_block) if_block.o(outrocallback);
				else outrocallback();

				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div1);
				}

				if (if_block) if_block.d();

				if (slot_content_default) {
					reinsertChildren(div0, slot_content_default);
				}
			}
		};
	}

	// (11:1) {#if image}
	function create_if_block$1(component, ctx) {
		var div, current;

		var imgl_initial_data = { src: ctx.image, alt: ctx.alt };
		var imgl = new Imgl({
			root: component.root,
			store: component.store,
			data: imgl_initial_data
		});

		return {
			c: function create() {
				div = createElement("div");
				imgl._fragment.c();
				div.className = "card-image";
				addLoc(div, file$2, 11, 8, 340);
			},

			m: function mount(target, anchor) {
				insert(target, div, anchor);
				imgl._mount(div, null);
				current = true;
			},

			p: function update(changed, ctx) {
				var imgl_changes = {};
				if (changed.image) imgl_changes.src = ctx.image;
				if (changed.alt) imgl_changes.alt = ctx.alt;
				imgl._set(imgl_changes);
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				if (imgl) imgl._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div);
				}

				imgl.destroy();
			}
		};
	}

	function Card(options) {
		this._debugName = '<Card>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data$2(), options.data);
		if (!('static' in this._state)) console.warn("<Card> was created without expected data property 'static'");
		if (!('col' in this._state)) console.warn("<Card> was created without expected data property 'col'");
		if (!('image' in this._state)) console.warn("<Card> was created without expected data property 'image'");
		if (!('alt' in this._state)) console.warn("<Card> was created without expected data property 'alt'");
		this._intro = !!options.intro;

		this._slotted = options.slots || {};

		this._fragment = create_main_fragment$2(this, this._state);

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}

		this._intro = true;
	}

	assign(Card.prototype, protoDev);

	Card.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\tags\Form.html generated by Svelte v2.16.1 */

	const file$3 = "ui\\tags\\Form.html";

	function create_main_fragment$3(component, ctx) {
		var div1, text, form, div0, slot_content_default = component._slotted.default, current;

		var if_block = (ctx.response) && create_if_block$2(component, ctx);

		return {
			c: function create() {
				div1 = createElement("div");
				if (if_block) if_block.c();
				text = createText("\r\n    \r\n    ");
				form = createElement("form");
				div0 = createElement("div");
				div0.className = "row";
				addLoc(div0, file$3, 11, 8, 333);
				form.className = "col s12";
				addLoc(form, file$3, 10, 4, 301);
				div1.className = "row";
				addLoc(div1, file$3, 0, 0, 0);
			},

			m: function mount(target, anchor) {
				insert(target, div1, anchor);
				if (if_block) if_block.m(div1, null);
				append(div1, text);
				append(div1, form);
				append(form, div0);

				if (slot_content_default) {
					append(div0, slot_content_default);
				}

				current = true;
			},

			p: function update(changed, ctx) {
				if (ctx.response) {
					if (if_block) {
						if_block.p(changed, ctx);
					} else {
						if_block = create_if_block$2(component, ctx);
						if_block.c();
						if_block.m(div1, text);
					}
				} else if (if_block) {
					if_block.d(1);
					if_block = null;
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div1);
				}

				if (if_block) if_block.d();

				if (slot_content_default) {
					reinsertChildren(div0, slot_content_default);
				}
			}
		};
	}

	// (3:4) {#if response}
	function create_if_block$2(component, ctx) {
		var if_block_anchor;

		function select_block_type(ctx) {
			if (!ctx.response.err) return create_if_block_1;
			return create_else_block$1;
		}

		var current_block_type = select_block_type(ctx);
		var if_block = current_block_type(component, ctx);

		return {
			c: function create() {
				if_block.c();
				if_block_anchor = createComment();
			},

			m: function mount(target, anchor) {
				if_block.m(target, anchor);
				insert(target, if_block_anchor, anchor);
			},

			p: function update(changed, ctx) {
				if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
					if_block.p(changed, ctx);
				} else {
					if_block.d(1);
					if_block = current_block_type(component, ctx);
					if_block.c();
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			},

			d: function destroy$$1(detach) {
				if_block.d(detach);
				if (detach) {
					detachNode(if_block_anchor);
				}
			}
		};
	}

	// (6:8) {:else}
	function create_else_block$1(component, ctx) {
		var span, text_value = ctx.response.err, text;

		return {
			c: function create() {
				span = createElement("span");
				text = createText(text_value);
				span.className = "new badge red left";
				span.dataset.badgeCaption = " ";
				addLoc(span, file$3, 6, 12, 185);
			},

			m: function mount(target, anchor) {
				insert(target, span, anchor);
				append(span, text);
			},

			p: function update(changed, ctx) {
				if ((changed.response) && text_value !== (text_value = ctx.response.err)) {
					setData(text, text_value);
				}
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(span);
				}
			}
		};
	}

	// (4:8) {#if !response.err}
	function create_if_block_1(component, ctx) {
		var span;

		return {
			c: function create() {
				span = createElement("span");
				span.textContent = "Done !";
				span.className = "new badge green left";
				span.dataset.badgeCaption = " ";
				addLoc(span, file$3, 4, 12, 83);
			},

			m: function mount(target, anchor) {
				insert(target, span, anchor);
			},

			p: noop,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(span);
				}
			}
		};
	}

	function Form(options) {
		this._debugName = '<Form>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign({}, options.data);
		if (!('response' in this._state)) console.warn("<Form> was created without expected data property 'response'");
		this._intro = !!options.intro;

		this._slotted = options.slots || {};

		this._fragment = create_main_fragment$3(this, this._state);

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);
		}

		this._intro = true;
	}

	assign(Form.prototype, protoDev);

	Form.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\tags\Input.html generated by Svelte v2.16.1 */

	function data$3() {
	    return {
	        validate: false,
	        helper: false,
	        class: '',
	        value: '',
	        min: 0,
	        max: 0,
	        disabled: false,
	        type: 'text',
	        label: null,
	        id: '',
	        col: '',
	        name: '',
	        dataempty: '',
	        dataerror: '',
	        length: null
	    }
	}
	function oncreate$1() {
	    M.updateTextFields();
	}
	const file$4 = "ui\\tags\\Input.html";

	function create_main_fragment$4(component, ctx) {
		var div, input, input_class_value, input_disabled_value, text0, text1, div_class_value, current;

		var if_block0 = (ctx.label) && create_if_block_1$1(component, ctx);

		var if_block1 = (ctx.helper) && create_if_block$3(component, ctx);

		return {
			c: function create() {
				div = createElement("div");
				input = createElement("input");
				text0 = createText("\r\n\t");
				if (if_block0) if_block0.c();
				text1 = createText("\r\n    ");
				if (if_block1) if_block1.c();
				input.id = ctx.id;
				setAttribute(input, "type", ctx.type);
				input.className = input_class_value = "" + ctx.class + " " + (ctx.validate ? "validate" : "");
				input.value = ctx.value;
				input.disabled = input_disabled_value = ctx.disabled ? true : false;
				input.min = ctx.min;
				input.max = ctx.max;
				addLoc(input, file$4, 1, 1, 54);
				div.className = div_class_value = "input-field " + (ctx.col ? "col" : "") + " " + ctx.col;
				addLoc(div, file$4, 0, 0, 0);
			},

			m: function mount(target, anchor) {
				insert(target, div, anchor);
				append(div, input);
				append(div, text0);
				if (if_block0) if_block0.m(div, null);
				append(div, text1);
				if (if_block1) if_block1.m(div, null);
				current = true;
			},

			p: function update(changed, ctx) {
				if (changed.id) {
					input.id = ctx.id;
				}

				if (changed.type) {
					setAttribute(input, "type", ctx.type);
				}

				if ((changed.class || changed.validate) && input_class_value !== (input_class_value = "" + ctx.class + " " + (ctx.validate ? "validate" : ""))) {
					input.className = input_class_value;
				}

				if (changed.value) {
					input.value = ctx.value;
				}

				if ((changed.disabled) && input_disabled_value !== (input_disabled_value = ctx.disabled ? true : false)) {
					input.disabled = input_disabled_value;
				}

				if (changed.min) {
					input.min = ctx.min;
				}

				if (changed.max) {
					input.max = ctx.max;
				}

				if (ctx.label) {
					if (if_block0) {
						if_block0.p(changed, ctx);
					} else {
						if_block0 = create_if_block_1$1(component, ctx);
						if_block0.c();
						if_block0.m(div, text1);
					}
				} else if (if_block0) {
					if_block0.d(1);
					if_block0 = null;
				}

				if (ctx.helper) {
					if (if_block1) {
						if_block1.p(changed, ctx);
					} else {
						if_block1 = create_if_block$3(component, ctx);
						if_block1.c();
						if_block1.m(div, null);
					}
				} else if (if_block1) {
					if_block1.d(1);
					if_block1 = null;
				}

				if ((changed.col) && div_class_value !== (div_class_value = "input-field " + (ctx.col ? "col" : "") + " " + ctx.col)) {
					div.className = div_class_value;
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div);
				}

				if (if_block0) if_block0.d();
				if (if_block1) if_block1.d();
			}
		};
	}

	// (3:1) {#if label}
	function create_if_block_1$1(component, ctx) {
		var label, text;

		return {
			c: function create() {
				label = createElement("label");
				text = createText(ctx.label);
				label.htmlFor = ctx.id;
				addLoc(label, file$4, 3, 8, 248);
			},

			m: function mount(target, anchor) {
				insert(target, label, anchor);
				append(label, text);
			},

			p: function update(changed, ctx) {
				if (changed.label) {
					setData(text, ctx.label);
				}

				if (changed.id) {
					label.htmlFor = ctx.id;
				}
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(label);
				}
			}
		};
	}

	// (6:4) {#if helper}
	function create_if_block$3(component, ctx) {
		var span;

		return {
			c: function create() {
				span = createElement("span");
				span.className = "helper-text";
				span.dataset.empty = ctx.dataempty;
				span.dataset.error = ctx.dataerror;
				addLoc(span, file$4, 6, 5, 315);
			},

			m: function mount(target, anchor) {
				insert(target, span, anchor);
			},

			p: function update(changed, ctx) {
				if (changed.dataempty) {
					span.dataset.empty = ctx.dataempty;
				}

				if (changed.dataerror) {
					span.dataset.error = ctx.dataerror;
				}
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(span);
				}
			}
		};
	}

	function Input(options) {
		this._debugName = '<Input>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data$3(), options.data);
		if (!('col' in this._state)) console.warn("<Input> was created without expected data property 'col'");
		if (!('id' in this._state)) console.warn("<Input> was created without expected data property 'id'");
		if (!('type' in this._state)) console.warn("<Input> was created without expected data property 'type'");
		if (!('class' in this._state)) console.warn("<Input> was created without expected data property 'class'");
		if (!('validate' in this._state)) console.warn("<Input> was created without expected data property 'validate'");
		if (!('value' in this._state)) console.warn("<Input> was created without expected data property 'value'");
		if (!('disabled' in this._state)) console.warn("<Input> was created without expected data property 'disabled'");
		if (!('min' in this._state)) console.warn("<Input> was created without expected data property 'min'");
		if (!('max' in this._state)) console.warn("<Input> was created without expected data property 'max'");
		if (!('label' in this._state)) console.warn("<Input> was created without expected data property 'label'");
		if (!('helper' in this._state)) console.warn("<Input> was created without expected data property 'helper'");
		if (!('dataempty' in this._state)) console.warn("<Input> was created without expected data property 'dataempty'");
		if (!('dataerror' in this._state)) console.warn("<Input> was created without expected data property 'dataerror'");
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$4(this, this._state);

		this.root._oncreate.push(() => {
			oncreate$1.call(this);
			this.fire("update", { changed: assignTrue({}, this._state), current: this._state });
		});

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}

		this._intro = true;
	}

	assign(Input.prototype, protoDev);

	Input.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\register\App.html generated by Svelte v2.16.1 */

	const utils = {
	    toast(html) {
	        M.toast({ html });
	    }
	};
	function data$4() {
	    return {
	        response: null
	    };
	}
	var methods = {
	    post() {
	        var canPost = true;
	        var cpass = document.getElementById("Cpass").value;
	        var pass = document.getElementById("password").value;

	        var formdata = {
	            "firstname": `${document.getElementById("firstname").value}`,
	            "lastname": `${document.getElementById("lastname").value}`,
	            "email": `${document.getElementById("email").value}`,
	            "password": `${pass}`
	        };


	        if (formdata.firstname === "" || 
	            formdata.lastname === "" ||
	            formdata.email === "" ||
	            formdata.password === "" ||
	            cpass !== pass) {
	                this.set({ response: { err: "fill all the fields exactly as it wants !", body: null } });
	                canPost = false;
	        } 

	        if(canPost){
	            fetch("/user/register", {
	                method: "POST",
	                mode: "same-origin",
	                credentials: "same-origin",
	                headers: {
	                    "Content-Type": "application/json"
	                },
	                redirect: "follow",
	                body: JSON.stringify(formdata)
	            }).then(res => {
	                if (res.status == 200) {
	                    this.set({ response: { err: null, body: res.body } });
	                    if (res.redirected) {
	                        window.location.href = res.url;
	                    }
	                }
	                else {
	                    utils.toast("Something went wrong !");
	                }
	            });
	        }

	            
	    }
	};

	function oncreate$2() {
	    M.AutoInit();
	    window.utils = utils;
	}
	const file$5 = "ui\\register\\App.html";

	function create_main_fragment$5(component, ctx) {
		var title_value, text0, div1, div0, text1, text2, text3, text4, text5, a, form_updating = {}, current;

		document.title = title_value = ctx.title;

		var input0_initial_data = {
		 	col: "s6",
		 	label: "First name",
		 	id: "firstname",
		 	type: "text"
		 };
		var input0 = new Input({
			root: component.root,
			store: component.store,
			data: input0_initial_data
		});

		var input1_initial_data = {
		 	col: "s6",
		 	label: "Last name",
		 	id: "lastname",
		 	type: "text"
		 };
		var input1 = new Input({
			root: component.root,
			store: component.store,
			data: input1_initial_data
		});

		var input2_initial_data = {
		 	col: "s12",
		 	label: "Email",
		 	id: "email",
		 	type: "email"
		 };
		var input2 = new Input({
			root: component.root,
			store: component.store,
			data: input2_initial_data
		});

		var input3_initial_data = {
		 	col: "s12",
		 	label: "Password",
		 	id: "password",
		 	type: "password",
		 	validate: true,
		 	helper: true,
		 	"data-empty": "Password is required"
		 };
		var input3 = new Input({
			root: component.root,
			store: component.store,
			data: input3_initial_data
		});

		var input4_initial_data = {
		 	col: "s12",
		 	label: "Comfirm Password",
		 	id: "Cpass",
		 	type: "password",
		 	validate: true,
		 	helper: true,
		 	"data-empty": "Comfirm password is required"
		 };
		var input4 = new Input({
			root: component.root,
			store: component.store,
			data: input4_initial_data
		});

		function click_handler(event) {
			component.post();
		}

		var form_initial_data = {};
		if (ctx.response !== void 0) {
			form_initial_data.response = ctx.response;
			form_updating.response = true;
		}
		var form = new Form({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: form_initial_data,
			_bind(changed, childState) {
				var newState = {};
				if (!form_updating.response && changed.response) {
					newState.response = childState.response;
				}
				component._set(newState);
				form_updating = {};
			}
		});

		component.root._beforecreate.push(() => {
			form._bind({ response: 1 }, form.get());
		});

		var card_initial_data = {
		 	col: "s10 offset-s1 m4 offset-m4 l6 offset-l3",
		 	image: "/public/img/cds.svg",
		 	alt: "logo"
		 };
		var card = new Card({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: card_initial_data
		});

		return {
			c: function create() {
				text0 = createText("\r\n");
				div1 = createElement("div");
				div0 = createElement("div");
				input0._fragment.c();
				text1 = createText("\r\n                ");
				input1._fragment.c();
				text2 = createText("\r\n                ");
				input2._fragment.c();
				text3 = createText("\r\n                ");
				input3._fragment.c();
				text4 = createText("\r\n                ");
				input4._fragment.c();
				text5 = createText("\r\n    \r\n                ");
				a = createElement("a");
				a.textContent = "Register";
				form._fragment.c();
				card._fragment.c();
				addListener(a, "click", click_handler);
				a.className = "waves-effect waves-light yellow black-text btn";
				addLoc(a, file$5, 15, 16, 824);
				div0.className = "row";
				addLoc(div0, file$5, 4, 4, 88);
				div1.className = "container";
				addLoc(div1, file$5, 3, 0, 59);
			},

			m: function mount(target, anchor) {
				insert(target, text0, anchor);
				insert(target, div1, anchor);
				append(div1, div0);
				input0._mount(form._slotted.default, null);
				append(form._slotted.default, text1);
				input1._mount(form._slotted.default, null);
				append(form._slotted.default, text2);
				input2._mount(form._slotted.default, null);
				append(form._slotted.default, text3);
				input3._mount(form._slotted.default, null);
				append(form._slotted.default, text4);
				input4._mount(form._slotted.default, null);
				append(form._slotted.default, text5);
				append(form._slotted.default, a);
				form._mount(card._slotted.default, null);
				card._mount(div0, null);
				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				if ((!current || changed.title) && title_value !== (title_value = ctx.title)) {
					document.title = title_value;
				}

				var form_changes = {};
				if (!form_updating.response && changed.response) {
					form_changes.response = ctx.response;
					form_updating.response = ctx.response !== void 0;
				}
				form._set(form_changes);
				form_updating = {};
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 7);

				if (input0) input0._fragment.o(outrocallback);
				if (input1) input1._fragment.o(outrocallback);
				if (input2) input2._fragment.o(outrocallback);
				if (input3) input3._fragment.o(outrocallback);
				if (input4) input4._fragment.o(outrocallback);
				if (form) form._fragment.o(outrocallback);
				if (card) card._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(text0);
					detachNode(div1);
				}

				input0.destroy();
				input1.destroy();
				input2.destroy();
				input3.destroy();
				input4.destroy();
				removeListener(a, "click", click_handler);
				form.destroy();
				card.destroy();
			}
		};
	}

	function App(options) {
		this._debugName = '<App>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data$4(), options.data);
		if (!('title' in this._state)) console.warn("<App> was created without expected data property 'title'");
		if (!('response' in this._state)) console.warn("<App> was created without expected data property 'response'");
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$5(this, this._state);

		this.root._oncreate.push(() => {
			oncreate$2.call(this);
			this.fire("update", { changed: assignTrue({}, this._state), current: this._state });
		});

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}

		this._intro = true;
	}

	assign(App.prototype, protoDev);
	assign(App.prototype, methods);

	App.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	const app = new App({
	    target: document.body,
	    data:{
	        title:"Register"
	    }
	});

	return app;

}());
//# sourceMappingURL=bundle.js.map

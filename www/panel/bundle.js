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

	function isPromise(value) {
		return value && typeof value.then === 'function';
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

	function detachBetween(before, after) {
		while (before.nextSibling && before.nextSibling !== after) {
			before.parentNode.removeChild(before.nextSibling);
		}
	}

	function reinsertBetween(before, after, target) {
		while (before.nextSibling && before.nextSibling !== after) {
			target.appendChild(before.parentNode.removeChild(before.nextSibling));
		}
	}

	function reinsertChildren(parent, target) {
		while (parent.firstChild) target.appendChild(parent.firstChild);
	}

	function destroyEach(iterations, detach) {
		for (var i = 0; i < iterations.length; i += 1) {
			if (iterations[i]) iterations[i].d(detach);
		}
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

	function handlePromise(promise, info) {
		var token = info.token = {};

		function update(type, index, key, value) {
			if (info.token !== token) return;

			info.resolved = key && { [key]: value };

			const child_ctx = assign(assign({}, info.ctx), info.resolved);
			const block = type && (info.current = type)(info.component, child_ctx);

			if (info.block) {
				if (info.blocks) {
					info.blocks.forEach((block, i) => {
						if (i !== index && block) {
							block.o(() => {
								block.d(1);
								info.blocks[i] = null;
							});
						}
					});
				} else {
					info.block.d(1);
				}

				block.c();
				block[block.i ? 'i' : 'm'](info.mount(), info.anchor);

				info.component.root.set({}); // flush any handlers that were created
			}

			info.block = block;
			if (info.blocks) info.blocks[index] = block;
		}

		if (isPromise(promise)) {
			promise.then(value => {
				update(info.then, 1, info.value, value);
			}, error => {
				update(info.catch, 2, info.error, error);
			});

			// if we previously had a then/catch block, destroy it
			if (info.current !== info.pending) {
				update(info.pending, 0);
				return true;
			}
		} else {
			if (info.current !== info.then) {
				update(info.then, 1, info.value, promise);
				return true;
			}

			info.resolved = { [info.value]: promise };
		}
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

	function unwrapExports (x) {
		return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x.default : x;
	}

	function createCommonjsModule(fn, module) {
		return module = { exports: {} }, fn(module, module.exports), module.exports;
	}

	var ckeditor = createCommonjsModule(function (module, exports) {
	/*!
	 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
	 * For licensing, see LICENSE.md.
	 */
	!function(t){t.en=Object.assign(t.en||{},{a:"Cannot upload file:",b:"Font Size",c:"Default",d:"Tiny",e:"Small",f:"Big",g:"Huge",h:"Align left",i:"Align right",j:"Align center",k:"Justify",l:"Text alignment",m:"Font Family",n:"Yellow marker",o:"Green marker",p:"Pink marker",q:"Blue marker",r:"Red pen",s:"Green pen",t:"Remove highlight",u:"Highlight",v:"Bold",w:"Strikethrough",x:"Block quote",y:"Underline",z:"Italic",aa:"image widget",ab:"Insert image or file",ac:"Choose heading",ad:"Heading",ae:"Insert image",af:"Full size image",ag:"Side image",ah:"Left aligned image",ai:"Centered image",aj:"Right aligned image",ak:"Numbered List",al:"Bulleted List",am:"Insert table",an:"Header column",ao:"Insert column left",ap:"Insert column right",aq:"Delete column",ar:"Column",as:"Header row",at:"Insert row below",au:"Insert row above",av:"Delete row",aw:"Row",ax:"Merge cell up",ay:"Merge cell right",az:"Merge cell down",ba:"Merge cell left",bb:"Split cell vertically",bc:"Split cell horizontally",bd:"Merge cells",be:"Upload failed",bf:"Link",bg:"Enter image caption",bh:"media widget",bi:"Insert media",bj:"The URL must not be empty.",bk:"This media URL is not supported.",bl:"Change image text alternative",bm:"Upload in progress",bn:"Could not obtain resized image URL.",bo:"Selecting resized image failed",bp:"Could not insert image at the current position.",bq:"Inserting image failed",br:"Save",bs:"Cancel",bt:"Media URL",bu:"Paste the URL into the content to embed faster.",bv:"Text alternative",bw:"Undo",bx:"Redo",by:"Unlink",bz:"Edit link",ca:"Open link in new tab",cb:"This link has no URL",cc:"Link URL",cd:"Paragraph",ce:"Heading 1",cf:"Heading 2",cg:"Heading 3",ch:"Rich Text Editor, %0"});}(window.CKEDITOR_TRANSLATIONS||(window.CKEDITOR_TRANSLATIONS={})),function(t,e){module.exports=e();}(window,function(){return function(t){var e={};function n(i){if(e[i])return e[i].exports;var o=e[i]={i:i,l:!1,exports:{}};return t[i].call(o.exports,o,o.exports,n),o.l=!0,o.exports}return n.m=t,n.c=e,n.d=function(t,e,i){n.o(t,e)||Object.defineProperty(t,e,{enumerable:!0,get:i});},n.r=function(t){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(t,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(t,"__esModule",{value:!0});},n.t=function(t,e){if(1&e&&(t=n(t)),8&e)return t;if(4&e&&"object"==typeof t&&t&&t.__esModule)return t;var i=Object.create(null);if(n.r(i),Object.defineProperty(i,"default",{enumerable:!0,value:t}),2&e&&"string"!=typeof t)for(var o in t)n.d(i,o,function(e){return t[e]}.bind(null,o));return i},n.n=function(t){var e=t&&t.__esModule?function(){return t.default}:function(){return t};return n.d(e,"a",e),e},n.o=function(t,e){return Object.prototype.hasOwnProperty.call(t,e)},n.p="",n(n.s=130)}([function(t,e,n){n.d(e,"b",function(){return o}),n.d(e,"a",function(){return r});const i="https://ckeditor.com/docs/ckeditor5/latest/framework/guides/support/error-codes.html";class o extends Error{constructor(t,e){t=r(t),e&&(t+=" "+JSON.stringify(e)),super(t),this.name="CKEditorError",this.data=e;}static isCKEditorError(t){return t instanceof o}}function r(t){const e=t.match(/^([^:]+):/);return e?t+` Read more: ${i}#error-${e[1]}\n`:t}},function(t,e,n){var i=n(0);const o={error(t,e){console.error(Object(i.a)(t),e);},warn(t,e){console.warn(Object(i.a)(t),e);}};e.a=o;},function(t,e,n){var i={},o=function(t){var e;return function(){return void 0===e&&(e=t.apply(this,arguments)),e}}(function(){return window&&document&&document.all&&!window.atob}),r=function(t){var e={};return function(t,n){if("function"==typeof t)return t();if(void 0===e[t]){var i=function(t,e){return e?e.querySelector(t):document.querySelector(t)}.call(this,t,n);if(window.HTMLIFrameElement&&i instanceof window.HTMLIFrameElement)try{i=i.contentDocument.head;}catch(t){i=null;}e[t]=i;}return e[t]}}(),s=null,a=0,c=[],l=n(56);function d(t,e){for(var n=0;n<t.length;n++){var o=t[n],r=i[o.id];if(r){r.refs++;for(var s=0;s<r.parts.length;s++)r.parts[s](o.parts[s]);for(;s<o.parts.length;s++)r.parts.push(p(o.parts[s],e));}else{var a=[];for(s=0;s<o.parts.length;s++)a.push(p(o.parts[s],e));i[o.id]={id:o.id,refs:1,parts:a};}}}function u(t,e){for(var n=[],i={},o=0;o<t.length;o++){var r=t[o],s=e.base?r[0]+e.base:r[0],a={css:r[1],media:r[2],sourceMap:r[3]};i[s]?i[s].parts.push(a):n.push(i[s]={id:s,parts:[a]});}return n}function h(t,e){var n=r(t.insertInto);if(!n)throw new Error("Couldn't find a style target. This probably means that the value for the 'insertInto' parameter is invalid.");var i=c[c.length-1];if("top"===t.insertAt)i?i.nextSibling?n.insertBefore(e,i.nextSibling):n.appendChild(e):n.insertBefore(e,n.firstChild),c.push(e);else if("bottom"===t.insertAt)n.appendChild(e);else{if("object"!=typeof t.insertAt||!t.insertAt.before)throw new Error("[Style Loader]\n\n Invalid value for parameter 'insertAt' ('options.insertAt') found.\n Must be 'top', 'bottom', or Object.\n (https://github.com/webpack-contrib/style-loader#insertat)\n");var o=r(t.insertAt.before,n);n.insertBefore(e,o);}}function f(t){if(null===t.parentNode)return !1;t.parentNode.removeChild(t);var e=c.indexOf(t);e>=0&&c.splice(e,1);}function m(t){var e=document.createElement("style");if(void 0===t.attrs.type&&(t.attrs.type="text/css"),void 0===t.attrs.nonce){var i=function(){return n.nc}();i&&(t.attrs.nonce=i);}return g(e,t.attrs),h(t,e),e}function g(t,e){Object.keys(e).forEach(function(n){t.setAttribute(n,e[n]);});}function p(t,e){var n,i,o,r;if(e.transform&&t.css){if(!(r="function"==typeof e.transform?e.transform(t.css):e.transform.default(t.css)))return function(){};t.css=r;}if(e.singleton){var c=a++;n=s||(s=m(e)),i=w.bind(null,n,c,!1),o=w.bind(null,n,c,!0);}else t.sourceMap&&"function"==typeof URL&&"function"==typeof URL.createObjectURL&&"function"==typeof URL.revokeObjectURL&&"function"==typeof Blob&&"function"==typeof btoa?(n=function(t){var e=document.createElement("link");return void 0===t.attrs.type&&(t.attrs.type="text/css"),t.attrs.rel="stylesheet",g(e,t.attrs),h(t,e),e}(e),i=function(t,e,n){var i=n.css,o=n.sourceMap,r=void 0===e.convertToAbsoluteUrls&&o;(e.convertToAbsoluteUrls||r)&&(i=l(i));o&&(i+="\n/*# sourceMappingURL=data:application/json;base64,"+btoa(unescape(encodeURIComponent(JSON.stringify(o))))+" */");var s=new Blob([i],{type:"text/css"}),a=t.href;t.href=URL.createObjectURL(s),a&&URL.revokeObjectURL(a);}.bind(null,n,e),o=function(){f(n),n.href&&URL.revokeObjectURL(n.href);}):(n=m(e),i=function(t,e){var n=e.css,i=e.media;i&&t.setAttribute("media",i);if(t.styleSheet)t.styleSheet.cssText=n;else{for(;t.firstChild;)t.removeChild(t.firstChild);t.appendChild(document.createTextNode(n));}}.bind(null,n),o=function(){f(n);});return i(t),function(e){if(e){if(e.css===t.css&&e.media===t.media&&e.sourceMap===t.sourceMap)return;i(t=e);}else o();}}t.exports=function(t,e){if("undefined"!=typeof DEBUG&&DEBUG&&"object"!=typeof document)throw new Error("The style-loader cannot be used in a non-browser environment");(e=e||{}).attrs="object"==typeof e.attrs?e.attrs:{},e.singleton||"boolean"==typeof e.singleton||(e.singleton=o()),e.insertInto||(e.insertInto="head"),e.insertAt||(e.insertAt="bottom");var n=u(t,e);return d(n,e),function(t){for(var o=[],r=0;r<n.length;r++){var s=n[r];(a=i[s.id]).refs--,o.push(a);}t&&d(u(t,e),e);for(r=0;r<o.length;r++){var a;if(0===(a=o[r]).refs){for(var c=0;c<a.parts.length;c++)a.parts[c]();delete i[a.id];}}}};var b=function(){var t=[];return function(e,n){return t[e]=n,t.filter(Boolean).join("\n")}}();function w(t,e,n,i){var o=n?"":i.css;if(t.styleSheet)t.styleSheet.cssText=b(e,o);else{var r=document.createTextNode(o),s=t.childNodes;s[e]&&t.removeChild(s[e]),s.length?t.insertBefore(r,s[e]):t.appendChild(r);}}},,function(t,e,n){var i=n(9),o="object"==typeof self&&self&&self.Object===Object&&self,r=i.a||o||Function("return this")();e.a=r;},function(t,e,n){(function(t){var i=n(9),o=exports&&!exports.nodeType&&exports,r=o&&"object"==typeof t&&t&&!t.nodeType&&t,s=r&&r.exports===o&&i.a.process,a=function(){try{var t=r&&r.require&&r.require("util").types;return t||s&&s.binding&&s.binding("util")}catch(t){}}();e.a=a;}).call(this,n(12)(t));},function(t,e,n){(function(t){var i=n(4),o=n(20),r=exports&&!exports.nodeType&&exports,s=r&&"object"==typeof t&&t&&!t.nodeType&&t,a=s&&s.exports===r?i.a.Buffer:void 0,c=(a?a.isBuffer:void 0)||o.a;e.a=c;}).call(this,n(12)(t));},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M6.972 16.615a.997.997 0 0 1-.744-.292l-4.596-4.596a1 1 0 1 1 1.414-1.414l3.926 3.926 9.937-9.937a1 1 0 0 1 1.414 1.415L7.717 16.323a.997.997 0 0 1-.745.292z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M11.591 10.177l4.243 4.242a1 1 0 0 1-1.415 1.415l-4.242-4.243-4.243 4.243a1 1 0 0 1-1.414-1.415l4.243-4.242L4.52 5.934A1 1 0 0 1 5.934 4.52l4.243 4.243 4.242-4.243a1 1 0 1 1 1.415 1.414l-4.243 4.243z"/></svg>';},function(t,e,n){(function(t){var n="object"==typeof t&&t&&t.Object===Object&&t;e.a=n;}).call(this,n(18));},function(t,e){t.exports='<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><path d="M.941 4.523a.75.75 0 1 1 1.06-1.06l3.006 3.005 3.005-3.005a.75.75 0 1 1 1.06 1.06l-3.549 3.55a.75.75 0 0 1-1.168-.136L.941 4.523z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M2 4.5V3h16v1.5zm0 3V6h5.674v1.5zm0 3V9h5.674v1.5zm0 3V12h5.674v1.5zm8.5-6V12h6V7.5h-6zM9.682 6h7.636c.377 0 .682.407.682.91v5.68c0 .503-.305.91-.682.91H9.682c-.377 0-.682-.407-.682-.91V6.91c0-.503.305-.91.682-.91zM2 16.5V15h16v1.5z"/></svg>';},function(t,e){t.exports=function(t){if(!t.webpackPolyfill){var e=Object.create(t);e.children||(e.children=[]),Object.defineProperty(e,"loaded",{enumerable:!0,get:function(){return e.l}}),Object.defineProperty(e,"id",{enumerable:!0,get:function(){return e.i}}),Object.defineProperty(e,"exports",{enumerable:!0}),e.webpackPolyfill=1;}return e};},function(t){t.exports={a:"11.2.0"};},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M2 3.75c0 .414.336.75.75.75h14.5a.75.75 0 1 0 0-1.5H2.75a.75.75 0 0 0-.75.75zm0 8c0 .414.336.75.75.75h14.5a.75.75 0 1 0 0-1.5H2.75a.75.75 0 0 0-.75.75zm0 4c0 .414.336.75.75.75h9.929a.75.75 0 1 0 0-1.5H2.75a.75.75 0 0 0-.75.75zm0-8c0 .414.336.75.75.75h9.929a.75.75 0 1 0 0-1.5H2.75a.75.75 0 0 0-.75.75z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M2 4.5V3h16v1.5zm2.5 3V12h11V7.5h-11zM4.061 6H15.94c.586 0 1.061.407 1.061.91v5.68c0 .503-.475.91-1.061.91H4.06c-.585 0-1.06-.407-1.06-.91V6.91C3 6.406 3.475 6 4.061 6zM2 16.5V15h16v1.5z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" clip-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="1.414"><path d="M18 4.5V3H2v1.5h16zm0 3V6h-5.674v1.5H18zm0 3V9h-5.674v1.5H18zm0 3V12h-5.674v1.5H18zm-8.5-6V12h-6V7.5h6zm.818-1.5H2.682C2.305 6 2 6.407 2 6.91v5.68c0 .503.305.91.682.91h7.636c.377 0 .682-.407.682-.91V6.91c0-.503-.305-.91-.682-.91zM18 16.5V15H2v1.5h16z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M2 4.5V3h16v1.5zm4.5 3V12h7V7.5h-7zM5.758 6h8.484c.419 0 .758.407.758.91v5.681c0 .502-.34.909-.758.909H5.758c-.419 0-.758-.407-.758-.91V6.91c0-.503.34-.91.758-.91zM2 16.5V15h16v1.5z"/></svg>';},function(t,e){var n;n=function(){return this}();try{n=n||new Function("return this")();}catch(t){"object"==typeof window&&(n=window);}t.exports=n;},function(t,e,n){var i=n(105);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e,n){e.a=function(){return !1};},function(t,e,n){(function(t){var i=n(4),o=exports&&!exports.nodeType&&exports,r=o&&"object"==typeof t&&t&&!t.nodeType&&t,s=r&&r.exports===o?i.a.Buffer:void 0,a=s?s.allocUnsafe:void 0;e.a=function(t,e){if(e)return t.slice();var n=t.length,i=a?a(n):new t.constructor(n);return t.copy(i),i};}).call(this,n(12)(t));},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M5.042 9.367l2.189 1.837a.75.75 0 0 1-.965 1.149l-3.788-3.18a.747.747 0 0 1-.21-.284.75.75 0 0 1 .17-.945L6.23 4.762a.75.75 0 1 1 .964 1.15L4.863 7.866h8.917A.75.75 0 0 1 14 7.9a4 4 0 1 1-1.477 7.718l.344-1.489a2.5 2.5 0 1 0 1.094-4.73l.008-.032H5.042z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M14.958 9.367l-2.189 1.837a.75.75 0 0 0 .965 1.149l3.788-3.18a.747.747 0 0 0 .21-.284.75.75 0 0 0-.17-.945L13.77 4.762a.75.75 0 1 0-.964 1.15l2.331 1.955H6.22A.75.75 0 0 0 6 7.9a4 4 0 1 0 1.477 7.718l-.344-1.489A2.5 2.5 0 1 1 6.039 9.4l-.008-.032h8.927z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M18 3.75a.75.75 0 0 1-.75.75H2.75a.75.75 0 1 1 0-1.5h14.5a.75.75 0 0 1 .75.75zm0 8a.75.75 0 0 1-.75.75H2.75a.75.75 0 1 1 0-1.5h14.5a.75.75 0 0 1 .75.75zm0 4a.75.75 0 0 1-.75.75H7.321a.75.75 0 1 1 0-1.5h9.929a.75.75 0 0 1 .75.75zm0-8a.75.75 0 0 1-.75.75H7.321a.75.75 0 1 1 0-1.5h9.929a.75.75 0 0 1 .75.75z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M2 3.75c0 .414.336.75.75.75h14.5a.75.75 0 1 0 0-1.5H2.75a.75.75 0 0 0-.75.75zm0 8c0 .414.336.75.75.75h14.5a.75.75 0 1 0 0-1.5H2.75a.75.75 0 0 0-.75.75zm2.286 4c0 .414.336.75.75.75h9.928a.75.75 0 1 0 0-1.5H5.036a.75.75 0 0 0-.75.75zm0-8c0 .414.336.75.75.75h9.928a.75.75 0 1 0 0-1.5H5.036a.75.75 0 0 0-.75.75z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M2 3.75c0 .414.336.75.75.75h14.5a.75.75 0 1 0 0-1.5H2.75a.75.75 0 0 0-.75.75zm0 8c0 .414.336.75.75.75h14.5a.75.75 0 1 0 0-1.5H2.75a.75.75 0 0 0-.75.75zm0 4c0 .414.336.75.75.75h9.929a.75.75 0 1 0 0-1.5H2.75a.75.75 0 0 0-.75.75zm0-8c0 .414.336.75.75.75h14.5a.75.75 0 1 0 0-1.5H2.75a.75.75 0 0 0-.75.75z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M9.816 11.5L7.038 4.785 4.261 11.5h5.555zm.62 1.5H3.641l-1.666 4.028H.312l5.789-14h1.875l5.789 14h-1.663L10.436 13zm7.55 2.279l.779-.779.707.707-2.265 2.265-2.193-2.265.707-.707.765.765V4.825c0-.042 0-.083.002-.123l-.77.77-.707-.707L17.207 2.5l2.265 2.265-.707.707-.782-.782c.002.043.003.089.003.135v10.454z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M11.03 3h6.149a.75.75 0 1 1 0 1.5h-5.514L11.03 3zm1.27 3h4.879a.75.75 0 1 1 0 1.5h-4.244L12.3 6zm1.27 3h3.609a.75.75 0 1 1 0 1.5h-2.973L13.57 9zm-2.754 2.5L8.038 4.785 5.261 11.5h5.555zm.62 1.5H4.641l-1.666 4.028H1.312l5.789-14h1.875l5.789 14h-1.663L11.436 13z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><g><path class="ck-icon__fill" d="M10.798 1.59L3.002 12.875l1.895 1.852 2.521 1.402 6.997-12.194z"/><path d="M2.556 16.727l.234-.348c-.297-.151-.462-.293-.498-.426-.036-.137.002-.416.115-.837.094-.25.15-.449.169-.595a4.495 4.495 0 0 0 0-.725c-.209-.621-.303-1.041-.284-1.26.02-.218.178-.506.475-.862l6.77-9.414c.539-.91 1.605-.85 3.199.18 1.594 1.032 2.188 1.928 1.784 2.686l-5.877 10.36c-.158.412-.333.673-.526.782-.193.108-.604.179-1.232.21-.362.131-.608.237-.738.318-.13.081-.305.238-.526.47-.293.265-.504.397-.632.397-.096 0-.27-.075-.524-.226l-.31.41-1.6-1.12zm-.279.415l1.575 1.103-.392.515H1.19l1.087-1.618zm8.1-13.656l-4.953 6.9L8.75 12.57l4.247-7.574c.175-.25-.188-.647-1.092-1.192-.903-.546-1.412-.652-1.528-.32zM8.244 18.5L9.59 17h9.406v1.5H8.245z"/></g></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path class="ck-icon__fill" d="M10.126 2.268L2.002 13.874l1.895 1.852 2.521 1.402L14.47 5.481l-1.543-2.568-2.801-.645z"/><path d="M4.5 18.088l-2.645-1.852-.04-2.95-.006-.005.006-.008v-.025l.011.008L8.73 2.97c.165-.233.356-.417.567-.557l-1.212.308L4.604 7.9l-.83-.558 3.694-5.495 2.708-.69 1.65 1.145.046.018.85-1.216 2.16 1.512-.856 1.222c.828.967 1.144 2.141.432 3.158L7.55 17.286l.006.005-3.055.797H4.5zm-.634.166l-1.976.516-.026-1.918 2.002 1.402zM9.968 3.817l-.006-.004-6.123 9.184 3.277 2.294 6.108-9.162.005.003c.317-.452-.16-1.332-1.064-1.966-.891-.624-1.865-.776-2.197-.349zM8.245 18.5L9.59 17h9.406v1.5H8.245z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><g><path d="M8.636 9.531l-2.758 3.94a.5.5 0 0 0 .122.696l3.224 2.284h1.314l2.636-3.736L8.636 9.53zm.288 8.451L5.14 15.396a2 2 0 0 1-.491-2.786l6.673-9.53a2 2 0 0 1 2.785-.49l3.742 2.62a2 2 0 0 1 .491 2.785l-7.269 10.053-2.147-.066z"/><path d="M4 18h5.523v-1H4zm-2 0h1v-1H2z"/></g></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10.187 17H5.773c-.637 0-1.092-.138-1.364-.415-.273-.277-.409-.718-.409-1.323V4.738c0-.617.14-1.062.419-1.332.279-.27.73-.406 1.354-.406h4.68c.69 0 1.288.041 1.793.124.506.083.96.242 1.36.478.341.197.644.447.906.75a3.262 3.262 0 0 1 .808 2.162c0 1.401-.722 2.426-2.167 3.075C15.05 10.175 16 11.315 16 13.01a3.756 3.756 0 0 1-2.296 3.504 6.1 6.1 0 0 1-1.517.377c-.571.073-1.238.11-2 .11zm-.217-6.217H7v4.087h3.069c1.977 0 2.965-.69 2.965-2.072 0-.707-.256-1.22-.768-1.537-.512-.319-1.277-.478-2.296-.478zM7 5.13v3.619h2.606c.729 0 1.292-.067 1.69-.2a1.6 1.6 0 0 0 .91-.765c.165-.267.247-.566.247-.897 0-.707-.26-1.176-.778-1.409-.519-.232-1.31-.348-2.375-.348H7z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M9.586 14.633l.021.004c-.036.335.095.655.393.962.082.083.173.15.274.201h1.474a.6.6 0 1 1 0 1.2H5.304a.6.6 0 0 1 0-1.2h1.15c.474-.07.809-.182 1.005-.334.157-.122.291-.32.404-.597l2.416-9.55a1.053 1.053 0 0 0-.281-.823 1.12 1.12 0 0 0-.442-.296H8.15a.6.6 0 0 1 0-1.2h6.443a.6.6 0 1 1 0 1.2h-1.195c-.376.056-.65.155-.823.296-.215.175-.423.439-.623.79l-2.366 9.347z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><g><path d="M7 16.4c-.8-.4-1.5-.9-2.2-1.5a.6.6 0 0 1-.2-.5l.3-.6h1c1 1.2 2.1 1.7 3.7 1.7 1 0 1.8-.3 2.3-.6.6-.4.6-1.2.6-1.3.2-1.2-.9-2.1-.9-2.1h2.1c.3.7.4 1.2.4 1.7v.8l-.6 1.2c-.6.8-1.1 1-1.6 1.2a6 6 0 0 1-2.4.6c-1 0-1.8-.3-2.5-.6zM6.8 9L6 8.3c-.4-.5-.5-.8-.5-1.6 0-.7.1-1.3.5-1.8.4-.6 1-1 1.6-1.3a6.3 6.3 0 0 1 4.7 0 4 4 0 0 1 1.7 1l.3.7c0 .1.2.4-.2.7-.4.2-.9.1-1 0a3 3 0 0 0-1.2-1c-.4-.2-1-.3-2-.4-.7 0-1.4.2-2 .6-.8.6-1 .8-1 1.5 0 .8.5 1 1.2 1.5.6.4 1.1.7 1.9 1H6.8z"/><path d="M3 10.5V9h14v1.5z"/></g></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><g><path d="M3 18v-1.5h14V18z"/><path d="M5.2 10V3.6c0-.4.4-.6.8-.6.3 0 .7.2.7.6v6.2c0 2 1.3 2.8 3.2 2.8 1.9 0 3.4-.9 3.4-2.9V3.6c0-.3.4-.5.8-.5.3 0 .7.2.7.5V10c0 2.7-2.2 4-4.9 4-2.6 0-4.7-1.2-4.7-4z"/></g></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M3 10.423a6.5 6.5 0 0 1 6.056-6.408l.038.67C6.448 5.423 5.354 7.663 5.22 10H9c.552 0 .5.432.5.986v4.511c0 .554-.448.503-1 .503h-5c-.552 0-.5-.449-.5-1.003v-4.574zm8 0a6.5 6.5 0 0 1 6.056-6.408l.038.67c-2.646.739-3.74 2.979-3.873 5.315H17c.552 0 .5.432.5.986v4.511c0 .554-.448.503-1 .503h-5c-.552 0-.5-.449-.5-1.003v-4.574z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M11.627 16.5a3.496 3.496 0 0 1 0 0zm5.873-.196a3.484 3.484 0 0 1 0 0zm0-7.001V8h-13v8.5h4.341c.191.54.457 1.044.785 1.5H2a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 2 2h4.5a1.5 1.5 0 0 1 1.06.44L9.122 4H16a1.5 1.5 0 0 1 1.5 1.5v1A1.5 1.5 0 0 1 19 8v2.531a6.027 6.027 0 0 0-1.5-1.228zM16 6.5v-1H8.5l-2-2H2v13h1V8a1.5 1.5 0 0 1 1.5-1.5H16z"/><path d="M14.5 19.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zM15 14v-2h-1v2h-2v1h2v2h1v-2h2v-1h-2z"/></svg>\n';},function(t,e){t.exports='<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M4 0v1H1v3H0V.5A.5.5 0 0 1 .5 0H4zm8 0h3.5a.5.5 0 0 1 .5.5V4h-1V1h-3V0zM4 16H.5a.5.5 0 0 1-.5-.5V12h1v3h3v1zm8 0v-1h3v-3h1v3.5a.5.5 0 0 1-.5.5H12z"/><path fill-opacity=".256" d="M1 1h14v14H1z"/><g class="ck-icon__selected-indicator"><path d="M7 0h2v1H7V0zM0 7h1v2H0V7zm15 0h1v2h-1V7zm-8 8h2v1H7v-1z"/><path fill-opacity=".254" d="M1 1h14v14H1z"/></g></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M5.085 6.22L2.943 4.078a.75.75 0 1 1 1.06-1.06l2.592 2.59A11.094 11.094 0 0 1 10 5.068c4.738 0 8.578 3.101 8.578 5.083 0 1.197-1.401 2.803-3.555 3.887l1.714 1.713a.75.75 0 0 1-.09 1.138.488.488 0 0 1-.15.084.75.75 0 0 1-.821-.16L6.17 7.304c-.258.11-.51.233-.757.365l6.239 6.24-.006.005.78.78c-.388.094-.78.166-1.174.215l-1.11-1.11h.011L4.55 8.197a7.2 7.2 0 0 0-.665.514l-.112.098 4.897 4.897-.005.006 1.276 1.276a10.164 10.164 0 0 1-1.477-.117l-.479-.479-.009.009-4.863-4.863-.022.031a2.563 2.563 0 0 0-.124.2c-.043.077-.08.158-.108.241a.534.534 0 0 0-.028.133.29.29 0 0 0 .008.072.927.927 0 0 0 .082.226c.067.133.145.26.234.379l3.242 3.365.025.01.59.623c-3.265-.918-5.59-3.155-5.59-4.668 0-1.194 1.448-2.838 3.663-3.93zm7.07.531a4.632 4.632 0 0 1 1.108 5.992l.345.344.046-.018a9.313 9.313 0 0 0 2-1.112c.256-.187.5-.392.727-.613.137-.134.27-.277.392-.431.072-.091.141-.185.203-.286.057-.093.107-.19.148-.292a.72.72 0 0 0 .036-.12.29.29 0 0 0 .008-.072.492.492 0 0 0-.028-.133.999.999 0 0 0-.036-.096 2.165 2.165 0 0 0-.071-.145 2.917 2.917 0 0 0-.125-.2 3.592 3.592 0 0 0-.263-.335 5.444 5.444 0 0 0-.53-.523 7.955 7.955 0 0 0-1.054-.768 9.766 9.766 0 0 0-1.879-.891c-.337-.118-.68-.219-1.027-.301zm-2.85.21l-.069.002a.508.508 0 0 0-.254.097.496.496 0 0 0-.104.679.498.498 0 0 0 .326.199l.045.005c.091.003.181.003.272.012a2.45 2.45 0 0 1 2.017 1.513c.024.061.043.125.069.185a.494.494 0 0 0 .45.287h.008a.496.496 0 0 0 .35-.158.482.482 0 0 0 .13-.335.638.638 0 0 0-.048-.219 3.379 3.379 0 0 0-.36-.723 3.438 3.438 0 0 0-2.791-1.543l-.028-.001h-.013z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M6.91 10.54c.26-.23.64-.21.88.03l3.36 3.14 2.23-2.06a.64.64 0 0 1 .87 0l2.52 2.97V4.5H3.2v10.12l3.71-4.08zm10.27-7.51c.6 0 1.09.47 1.09 1.05v11.84c0 .59-.49 1.06-1.09 1.06H2.79c-.6 0-1.09-.47-1.09-1.06V4.08c0-.58.49-1.05 1.1-1.05h14.38zm-5.22 5.56a1.96 1.96 0 1 1 3.4-1.96 1.96 1.96 0 0 1-3.4 1.96z"/></svg>';},function(t,e){t.exports='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 250"><rect rx="4"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M11.077 15l.991-1.416a.75.75 0 1 1 1.229.86l-1.148 1.64a.748.748 0 0 1-.217.206 5.251 5.251 0 0 1-8.503-5.955.741.741 0 0 1 .12-.274l1.147-1.639a.75.75 0 1 1 1.228.86L4.933 10.7l.006.003a3.75 3.75 0 0 0 6.132 4.294l.006.004zm5.494-5.335a.748.748 0 0 1-.12.274l-1.147 1.639a.75.75 0 1 1-1.228-.86l.86-1.23a3.75 3.75 0 0 0-6.144-4.301l-.86 1.229a.75.75 0 0 1-1.229-.86l1.148-1.64a.748.748 0 0 1 .217-.206 5.251 5.251 0 0 1 8.503 5.955zm-4.563-2.532a.75.75 0 0 1 .184 1.045l-3.155 4.505a.75.75 0 1 1-1.229-.86l3.155-4.506a.75.75 0 0 1 1.045-.184zm4.919 10.562l-1.414 1.414a.75.75 0 1 1-1.06-1.06l1.414-1.415-1.415-1.414a.75.75 0 0 1 1.061-1.06l1.414 1.414 1.414-1.415a.75.75 0 0 1 1.061 1.061l-1.414 1.414 1.414 1.415a.75.75 0 0 1-1.06 1.06l-1.415-1.414z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M7.3 17.37l-.061.088a1.518 1.518 0 0 1-.934.535l-4.178.663-.806-4.153a1.495 1.495 0 0 1 .187-1.058l.056-.086L8.77 2.639c.958-1.351 2.803-1.076 4.296-.03 1.497 1.047 2.387 2.693 1.433 4.055L7.3 17.37zM9.14 4.728l-5.545 8.346 3.277 2.294 5.544-8.346L9.14 4.728zM6.07 16.512l-3.276-2.295.53 2.73 2.746-.435zM9.994 3.506L13.271 5.8c.316-.452-.16-1.333-1.065-1.966-.905-.634-1.895-.78-2.212-.328zM8 18.5L9.375 17H19v1.5H8z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M11.077 15l.991-1.416a.75.75 0 1 1 1.229.86l-1.148 1.64a.748.748 0 0 1-.217.206 5.251 5.251 0 0 1-8.503-5.955.741.741 0 0 1 .12-.274l1.147-1.639a.75.75 0 1 1 1.228.86L4.933 10.7l.006.003a3.75 3.75 0 0 0 6.132 4.294l.006.004zm5.494-5.335a.748.748 0 0 1-.12.274l-1.147 1.639a.75.75 0 1 1-1.228-.86l.86-1.23a3.75 3.75 0 0 0-6.144-4.301l-.86 1.229a.75.75 0 0 1-1.229-.86l1.148-1.64a.748.748 0 0 1 .217-.206 5.251 5.251 0 0 1 8.503 5.955zm-4.563-2.532a.75.75 0 0 1 .184 1.045l-3.155 4.505a.75.75 0 1 1-1.229-.86l3.155-4.506a.75.75 0 0 1 1.045-.184z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M7 5.75c0 .414.336.75.75.75h9.5a.75.75 0 1 0 0-1.5h-9.5a.75.75 0 0 0-.75.75zM3.5 3v5H2V3.7H1v-1h2.5V3zM.343 17.857l2.59-3.257H2.92a.6.6 0 1 0-1.04 0H.302a2 2 0 1 1 3.995 0h-.001c-.048.405-.16.734-.333.988-.175.254-.59.692-1.244 1.312H4.3v1h-4l.043-.043zM7 14.75a.75.75 0 0 1 .75-.75h9.5a.75.75 0 1 1 0 1.5h-9.5a.75.75 0 0 1-.75-.75z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M7 5.75c0 .414.336.75.75.75h9.5a.75.75 0 1 0 0-1.5h-9.5a.75.75 0 0 0-.75.75zm-6 0C1 4.784 1.777 4 2.75 4c.966 0 1.75.777 1.75 1.75 0 .966-.777 1.75-1.75 1.75C1.784 7.5 1 6.723 1 5.75zm6 9c0 .414.336.75.75.75h9.5a.75.75 0 1 0 0-1.5h-9.5a.75.75 0 0 0-.75.75zm-6 0c0-.966.777-1.75 1.75-1.75.966 0 1.75.777 1.75 1.75 0 .966-.777 1.75-1.75 1.75-.966 0-1.75-.777-1.75-1.75z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 64 42" xmlns="http://www.w3.org/2000/svg"><path d="M47.426 17V3.713L63.102 0v19.389h-.001l.001.272c0 1.595-2.032 3.43-4.538 4.098-2.506.668-4.538-.083-4.538-1.678 0-1.594 2.032-3.43 4.538-4.098.914-.244 2.032-.565 2.888-.603V4.516L49.076 7.447v9.556A1.014 1.014 0 0 0 49 17h-1.574zM29.5 17h-8.343a7.073 7.073 0 1 0-4.657 4.06v3.781H3.3a2.803 2.803 0 0 1-2.8-2.804V8.63a2.803 2.803 0 0 1 2.8-2.805h4.082L8.58 2.768A1.994 1.994 0 0 1 10.435 1.5h8.985c.773 0 1.477.448 1.805 1.149l1.488 3.177H26.7c1.546 0 2.8 1.256 2.8 2.805V17zm-11.637 0H17.5a1 1 0 0 0-1 1v.05A4.244 4.244 0 1 1 17.863 17zm29.684 2c.97 0 .953-.048.953.889v20.743c0 .953.016.905-.953.905H19.453c-.97 0-.953.048-.953-.905V19.89c0-.937-.016-.889.97-.889h28.077zm-4.701 19.338V22.183H24.154v16.155h18.692zM20.6 21.375v1.616h1.616v-1.616H20.6zm0 3.231v1.616h1.616v-1.616H20.6zm0 3.231v1.616h1.616v-1.616H20.6zm0 3.231v1.616h1.616v-1.616H20.6zm0 3.231v1.616h1.616v-1.616H20.6zm0 3.231v1.616h1.616V37.53H20.6zm24.233-16.155v1.616h1.615v-1.616h-1.615zm0 3.231v1.616h1.615v-1.616h-1.615zm0 3.231v1.616h1.615v-1.616h-1.615zm0 3.231v1.616h1.615v-1.616h-1.615zm0 3.231v1.616h1.615v-1.616h-1.615zm0 3.231v1.616h1.615V37.53h-1.615zM29.485 25.283a.4.4 0 0 1 .593-.35l9.05 4.977a.4.4 0 0 1 0 .701l-9.05 4.978a.4.4 0 0 1-.593-.35v-9.956z"/></svg>\n';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M18.68 2.53c.6 0 .59-.03.59.55v12.84c0 .59.01.56-.59.56H1.29c-.6 0-.59.03-.59-.56V3.08c0-.58-.01-.55.6-.55h17.38zM15.77 14.5v-10H4.2v10h11.57zM2 4v1h1V4H2zm0 2v1h1V6H2zm0 2v1h1V8H2zm0 2v1h1v-1H2zm0 2v1h1v-1H2zm0 2v1h1v-1H2zM17 4v1h1V4h-1zm0 2v1h1V6h-1zm0 2v1h1V8h-1zm0 2v1h1v-1h-1zm0 2v1h1v-1h-1zm0 2v1h1v-1h-1zM7.5 6.677a.4.4 0 0 1 .593-.351l5.133 2.824a.4.4 0 0 1 0 .7l-5.133 2.824a.4.4 0 0 1-.593-.35V6.676z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M3 6v3h4V6H3zm0 4v3h4v-3H3zm0 4v3h4v-3H3zm5 3h4v-3H8v3zm5 0h4v-3h-4v3zm4-4v-3h-4v3h4zm0-4V6h-4v3h4zm1.5 8a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 17V4c.222-.863 1.068-1.5 2-1.5h13c.932 0 1.778.637 2 1.5v13zM12 13v-3H8v3h4zm0-4V6H8v3h4z"/></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><g><path d="M2.5 1h15A1.5 1.5 0 0 1 19 2.5v15a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 1 17.5v-15A1.5 1.5 0 0 1 2.5 1zM2 2v16h16V2H2z" opacity=".6"/><path d="M18 7v1H2V7h16zm0 5v1H2v-1h16z" opacity=".6"/><path d="M14 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V1a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1zm-2 1H8v4h4V2zm0 6H8v4h4V8zm0 6H8v4h4v-4z"/></g></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><g><path d="M2.5 1h15A1.5 1.5 0 0 1 19 2.5v15a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 1 17.5v-15A1.5 1.5 0 0 1 2.5 1zM2 2v16h16V2H2z" opacity=".6"/><path d="M7 2h1v16H7V2zm5 0h1v16h-1V2z" opacity=".6"/><path d="M1 6h18a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm1 2v4h4V8H2zm6 0v4h4V8H8zm6 0v4h4V8h-4z"/></g></svg>';},function(t,e){t.exports='<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><g><path d="M2.5 1h15A1.5 1.5 0 0 1 19 2.5v15a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 1 17.5v-15A1.5 1.5 0 0 1 2.5 1zM2 2v16h16V2H2z" opacity=".6"/><path d="M7 2h1v16H7V2zm5 0h1v7h-1V2zm6 5v1H2V7h16zM8 12v1H2v-1h6z" opacity=".6"/><path d="M7 7h12a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm1 2v9h10V9H8z"/></g></svg>';},function(t,e,n){(function(t){var e=n(1),i=n(13);const o="object"==typeof window?window:t;o.CKEDITOR_VERSION?e.a.error("ckeditor-version-collision: The global CKEDITOR_VERSION constant has already been set.",{collidingVersion:o.CKEDITOR_VERSION,version:i.a}):o.CKEDITOR_VERSION=i.a;}).call(this,n(18));},function(t,e,n){var i=n(55);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck-hidden{display:none!important}.ck.ck-reset,.ck.ck-reset_all,.ck.ck-reset_all *{box-sizing:border-box;width:auto;height:auto;position:static}:root{--ck-z-default:1;--ck-z-modal:calc(var(--ck-z-default) + 999);--ck-color-base-foreground:#fafafa;--ck-color-base-background:#fff;--ck-color-base-border:#c4c4c4;--ck-color-base-action:#61b045;--ck-color-base-focus:#6cb5f9;--ck-color-base-text:#333;--ck-color-base-active:#198cf0;--ck-color-base-active-focus:#0e7fe1;--ck-color-base-error:#db3700;--ck-color-focus-border:#47a4f5;--ck-color-focus-shadow:rgba(119,186,248,0.5);--ck-color-focus-disabled-shadow:rgba(119,186,248,0.3);--ck-color-focus-error-shadow:rgba(255,64,31,0.3);--ck-color-text:var(--ck-color-base-text);--ck-color-shadow-drop:rgba(0,0,0,0.15);--ck-color-shadow-inner:rgba(0,0,0,0.1);--ck-color-button-default-background:transparent;--ck-color-button-default-hover-background:#e6e6e6;--ck-color-button-default-active-background:#d9d9d9;--ck-color-button-default-active-shadow:#bfbfbf;--ck-color-button-default-disabled-background:transparent;--ck-color-button-on-background:#dedede;--ck-color-button-on-hover-background:#c4c4c4;--ck-color-button-on-active-background:#bababa;--ck-color-button-on-active-shadow:#a1a1a1;--ck-color-button-on-disabled-background:#dedede;--ck-color-button-action-background:var(--ck-color-base-action);--ck-color-button-action-hover-background:#579e3d;--ck-color-button-action-active-background:#53973b;--ck-color-button-action-active-shadow:#498433;--ck-color-button-action-disabled-background:#7ec365;--ck-color-button-action-text:var(--ck-color-base-background);--ck-color-button-save:#008a00;--ck-color-button-cancel:#db3700;--ck-color-switch-button-off-background:#b0b0b0;--ck-color-switch-button-on-background:var(--ck-color-button-action-background);--ck-color-switch-button-inner-background:var(--ck-color-base-background);--ck-color-dropdown-panel-background:var(--ck-color-base-background);--ck-color-dropdown-panel-border:var(--ck-color-base-border);--ck-color-input-background:var(--ck-color-base-background);--ck-color-input-border:#c7c7c7;--ck-color-input-error-border:var(--ck-color-base-error);--ck-color-input-text:var(--ck-color-base-text);--ck-color-input-disabled-background:#f2f2f2;--ck-color-input-disabled-border:#c7c7c7;--ck-color-input-disabled-text:#5c5c5c;--ck-color-list-background:var(--ck-color-base-background);--ck-color-list-button-hover-background:var(--ck-color-base-foreground);--ck-color-list-button-on-background:var(--ck-color-base-active);--ck-color-list-button-on-background-focus:var(--ck-color-base-active-focus);--ck-color-list-button-on-text:var(--ck-color-base-background);--ck-color-panel-background:var(--ck-color-base-background);--ck-color-panel-border:var(--ck-color-base-border);--ck-color-toolbar-background:var(--ck-color-base-foreground);--ck-color-toolbar-border:var(--ck-color-base-border);--ck-color-tooltip-background:var(--ck-color-base-text);--ck-color-tooltip-text:var(--ck-color-base-background);--ck-color-engine-placeholder-text:#c2c2c2;--ck-color-upload-bar-background:#6cb5f9;--ck-color-upload-infinite-background:rgba(0,0,0,0.1);--ck-color-link-default:#0000f0;--ck-color-link-selected-background:rgba(31,177,255,0.1);--ck-disabled-opacity:.5;--ck-focus-outer-shadow-geometry:0 0 0 3px;--ck-focus-outer-shadow:var(--ck-focus-outer-shadow-geometry) var(--ck-color-focus-shadow);--ck-focus-disabled-outer-shadow:var(--ck-focus-outer-shadow-geometry) var(--ck-color-focus-disabled-shadow);--ck-focus-error-outer-shadow:var(--ck-focus-outer-shadow-geometry) var(--ck-color-focus-error-shadow);--ck-focus-ring:1px solid var(--ck-color-focus-border);--ck-font-size-base:13px;--ck-line-height-base:1.84615;--ck-font-face:Helvetica,Arial,Tahoma,Verdana,Sans-Serif;--ck-font-size-tiny:0.7em;--ck-font-size-small:0.75em;--ck-font-size-normal:1em;--ck-font-size-big:1.4em;--ck-font-size-large:1.8em;--ck-ui-component-min-height:2.3em}.ck.ck-reset,.ck.ck-reset_all,.ck.ck-reset_all *{margin:0;padding:0;border:0;background:transparent;text-decoration:none;vertical-align:middle;transition:none;word-wrap:break-word}.ck.ck-reset_all,.ck.ck-reset_all *{border-collapse:collapse;font:normal normal normal var(--ck-font-size-base)/var(--ck-line-height-base) var(--ck-font-face);color:var(--ck-color-text);text-align:left;white-space:nowrap;cursor:auto;float:none}.ck.ck-reset_all .ck-rtl *{text-align:right}.ck.ck-reset_all iframe{vertical-align:inherit}.ck.ck-reset_all textarea{white-space:pre-wrap}.ck.ck-reset_all input[type=password],.ck.ck-reset_all input[type=text],.ck.ck-reset_all textarea{cursor:text}.ck.ck-reset_all input[type=password][disabled],.ck.ck-reset_all input[type=text][disabled],.ck.ck-reset_all textarea[disabled]{cursor:default}.ck.ck-reset_all fieldset{padding:10px;border:2px groove #dfdee3}.ck.ck-reset_all button::-moz-focus-inner{padding:0;border:0}:root{--ck-border-radius:2px;--ck-inner-shadow:2px 2px 3px var(--ck-color-shadow-inner) inset;--ck-drop-shadow:0 1px 2px 1px var(--ck-color-shadow-drop);--ck-spacing-unit:0.6em;--ck-spacing-large:calc(var(--ck-spacing-unit)*1.5);--ck-spacing-standard:var(--ck-spacing-unit);--ck-spacing-medium:calc(var(--ck-spacing-unit)*0.8);--ck-spacing-small:calc(var(--ck-spacing-unit)*0.5);--ck-spacing-tiny:calc(var(--ck-spacing-unit)*0.3);--ck-spacing-extra-tiny:calc(var(--ck-spacing-unit)*0.16)}";},function(t,e){t.exports=function(t){var e="undefined"!=typeof window&&window.location;if(!e)throw new Error("fixUrls requires window.location");if(!t||"string"!=typeof t)return t;var n=e.protocol+"//"+e.host,i=n+e.pathname.replace(/\/[^\/]*$/,"/");return t.replace(/url\s*\(((?:[^)(]|\((?:[^)(]+|\([^)(]*\))*\))*)\)/gi,function(t,e){var o,r=e.trim().replace(/^"(.*)"$/,function(t,e){return e}).replace(/^'(.*)'$/,function(t,e){return e});return /^(#|data:|http:\/\/|https:\/\/|file:\/\/\/|\s*$)/i.test(r)?t:(o=0===r.indexOf("//")?r:0===r.indexOf("/")?n+r:i+r.replace(/^\.\//,""),"url("+JSON.stringify(o)+")")})};},function(t,e,n){var i=n(58);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck.ck-editor__editable:not(.ck-editor__nested-editable){border-radius:0}.ck-rounded-corners .ck.ck-editor__editable:not(.ck-editor__nested-editable),.ck.ck-editor__editable:not(.ck-editor__nested-editable).ck-rounded-corners{border-radius:var(--ck-border-radius)}.ck.ck-editor__editable:not(.ck-editor__nested-editable).ck-focused{outline:none;border:var(--ck-focus-ring);box-shadow:var(--ck-inner-shadow),0 0}.ck.ck-editor__editable_inline{overflow:auto;padding:0 var(--ck-spacing-standard);border:1px solid transparent}.ck.ck-editor__editable_inline>:first-child{margin-top:var(--ck-spacing-large)}.ck.ck-editor__editable_inline>:last-child{margin-bottom:var(--ck-spacing-large)}.ck.ck-balloon-panel.ck-toolbar-container[class*=arrow_n]:after{border-bottom-color:var(--ck-color-base-foreground)}.ck.ck-balloon-panel.ck-toolbar-container[class*=arrow_s]:after{border-top-color:var(--ck-color-base-foreground)}";},function(t,e,n){var i=n(60);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck.ck-toolbar{-moz-user-select:none;-webkit-user-select:none;-ms-user-select:none;user-select:none;display:flex;flex-flow:row wrap;align-items:center}.ck.ck-toolbar.ck-toolbar_vertical{flex-direction:column}.ck.ck-toolbar.ck-toolbar_floating{flex-wrap:nowrap}.ck.ck-toolbar__separator{display:inline-block}.ck.ck-toolbar__newline{display:block;width:100%}.ck.ck-toolbar{border-radius:0}.ck-rounded-corners .ck.ck-toolbar,.ck.ck-toolbar.ck-rounded-corners{border-radius:var(--ck-border-radius)}.ck.ck-toolbar{background:var(--ck-color-toolbar-background);padding:0 var(--ck-spacing-small);border:1px solid var(--ck-color-toolbar-border)}.ck.ck-toolbar>*{margin-right:var(--ck-spacing-small);margin-top:var(--ck-spacing-small);margin-bottom:var(--ck-spacing-small)}.ck.ck-toolbar.ck-toolbar_vertical{padding:0}.ck.ck-toolbar.ck-toolbar_vertical>*{width:100%;margin:0;border-radius:0;border:0}.ck.ck-toolbar>:last-child{margin-right:0}.ck-toolbar-container .ck.ck-toolbar{border:0}.ck.ck-toolbar__separator{align-self:stretch;width:1px;margin-top:0;margin-bottom:0;background:var(--ck-color-toolbar-border)}.ck.ck-toolbar__newline{margin:0}";},function(t,e,n){var i=n(62);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck.ck-icon{vertical-align:middle}:root{--ck-icon-size:calc(var(--ck-line-height-base)*var(--ck-font-size-normal))}.ck.ck-icon{width:var(--ck-icon-size);height:var(--ck-icon-size);font-size:.8333350694em;will-change:transform}.ck.ck-icon,.ck.ck-icon *{color:inherit;cursor:inherit}.ck.ck-icon :not([fill]){fill:currentColor}";},function(t,e,n){var i=n(64);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports='.ck.ck-tooltip,.ck.ck-tooltip .ck-tooltip__text:after{position:absolute;pointer-events:none;-webkit-backface-visibility:hidden}.ck-tooltip{visibility:hidden;opacity:0;display:none;z-index:var(--ck-z-modal)}.ck-tooltip .ck-tooltip__text{display:inline-block}.ck-tooltip .ck-tooltip__text:after{content:"";width:0;height:0}:root{--ck-tooltip-arrow-size:5px}.ck.ck-tooltip{left:50%}.ck.ck-tooltip.ck-tooltip_s{bottom:calc(-1*var(--ck-tooltip-arrow-size));transform:translateY(100%)}.ck.ck-tooltip.ck-tooltip_s .ck-tooltip__text:after{top:calc(-1*var(--ck-tooltip-arrow-size));transform:translateX(-50%);border-left-color:transparent;border-bottom-color:var(--ck-color-tooltip-background);border-right-color:transparent;border-top-color:transparent;border-left-width:var(--ck-tooltip-arrow-size);border-bottom-width:var(--ck-tooltip-arrow-size);border-right-width:var(--ck-tooltip-arrow-size);border-top-width:0}.ck.ck-tooltip.ck-tooltip_n{top:calc(-1*var(--ck-tooltip-arrow-size));transform:translateY(-100%)}.ck.ck-tooltip.ck-tooltip_n .ck-tooltip__text:after{bottom:calc(-1*var(--ck-tooltip-arrow-size));transform:translateX(-50%);border-left-color:transparent;border-bottom-color:transparent;border-right-color:transparent;border-top-color:var(--ck-color-tooltip-background);border-left-width:var(--ck-tooltip-arrow-size);border-bottom-width:0;border-right-width:var(--ck-tooltip-arrow-size);border-top-width:var(--ck-tooltip-arrow-size)}.ck.ck-tooltip .ck-tooltip__text{border-radius:0}.ck-rounded-corners .ck.ck-tooltip .ck-tooltip__text,.ck.ck-tooltip .ck-tooltip__text.ck-rounded-corners{border-radius:var(--ck-border-radius)}.ck.ck-tooltip .ck-tooltip__text{font-size:.9em;line-height:1.5;color:var(--ck-color-tooltip-text);padding:var(--ck-spacing-small) var(--ck-spacing-medium);background:var(--ck-color-tooltip-background);position:relative;left:-50%}.ck.ck-tooltip .ck-tooltip__text:after{border-style:solid;left:50%}.ck.ck-tooltip,.ck.ck-tooltip .ck-tooltip__text:after{transition:opacity .2s ease-in-out .2s}';},function(t,e,n){var i=n(66);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck.ck-button,a.ck.ck-button{-moz-user-select:none;-webkit-user-select:none;-ms-user-select:none;user-select:none}.ck.ck-button .ck-tooltip,a.ck.ck-button .ck-tooltip{display:block}@media (hover:none){.ck.ck-button .ck-tooltip,a.ck.ck-button .ck-tooltip{display:none}}.ck.ck-button,a.ck.ck-button{position:relative;display:inline-flex;align-items:center;justify-content:left}.ck.ck-button.ck-button_with-text .ck-button__label,a.ck.ck-button.ck-button_with-text .ck-button__label{display:inline-block}.ck.ck-button:not(.ck-button_with-text),a.ck.ck-button:not(.ck-button_with-text){justify-content:center}.ck.ck-button:hover .ck-tooltip,a.ck.ck-button:hover .ck-tooltip{visibility:visible;opacity:1}.ck.ck-button .ck-button__label,.ck.ck-button:focus:not(:hover) .ck-tooltip,a.ck.ck-button .ck-button__label,a.ck.ck-button:focus:not(:hover) .ck-tooltip{display:none}.ck.ck-button,a.ck.ck-button{background:var(--ck-color-button-default-background)}.ck.ck-button:not(.ck-disabled):hover,a.ck.ck-button:not(.ck-disabled):hover{background:var(--ck-color-button-default-hover-background)}.ck.ck-button:not(.ck-disabled):active,a.ck.ck-button:not(.ck-disabled):active{background:var(--ck-color-button-default-active-background);box-shadow:inset 0 2px 2px var(--ck-color-button-default-active-shadow)}.ck.ck-button.ck-disabled,a.ck.ck-button.ck-disabled{background:var(--ck-color-button-default-disabled-background)}.ck.ck-button,a.ck.ck-button{border-radius:0}.ck-rounded-corners .ck.ck-button,.ck-rounded-corners a.ck.ck-button,.ck.ck-button.ck-rounded-corners,a.ck.ck-button.ck-rounded-corners{border-radius:var(--ck-border-radius)}.ck.ck-button,a.ck.ck-button{white-space:nowrap;cursor:default;vertical-align:middle;padding:var(--ck-spacing-tiny);text-align:center;min-width:var(--ck-ui-component-min-height);min-height:var(--ck-ui-component-min-height);line-height:1;font-size:inherit;border:1px solid transparent;transition:box-shadow .2s ease-in-out;-webkit-appearance:none}.ck.ck-button:active,.ck.ck-button:focus,a.ck.ck-button:active,a.ck.ck-button:focus{outline:none;border:var(--ck-focus-ring);box-shadow:var(--ck-focus-outer-shadow),0 0;border-color:transparent}.ck.ck-button.ck-disabled:active,.ck.ck-button.ck-disabled:focus,a.ck.ck-button.ck-disabled:active,a.ck.ck-button.ck-disabled:focus{box-shadow:var(--ck-focus-disabled-outer-shadow),0 0}.ck.ck-button.ck-disabled .ck-button__icon,a.ck.ck-button.ck-disabled .ck-button__icon{opacity:var(--ck-disabled-opacity)}.ck.ck-button.ck-disabled .ck-button__label,a.ck.ck-button.ck-disabled .ck-button__label{opacity:var(--ck-disabled-opacity)}.ck.ck-button.ck-button_with-text,a.ck.ck-button.ck-button_with-text{padding:var(--ck-spacing-tiny) var(--ck-spacing-standard)}.ck.ck-button.ck-button_with-text .ck-button__icon,a.ck.ck-button.ck-button_with-text .ck-button__icon{margin-left:calc(-1*var(--ck-spacing-small));margin-right:var(--ck-spacing-small)}.ck.ck-button.ck-on,a.ck.ck-button.ck-on{background:var(--ck-color-button-on-background)}.ck.ck-button.ck-on:not(.ck-disabled):hover,a.ck.ck-button.ck-on:not(.ck-disabled):hover{background:var(--ck-color-button-on-hover-background)}.ck.ck-button.ck-on:not(.ck-disabled):active,a.ck.ck-button.ck-on:not(.ck-disabled):active{background:var(--ck-color-button-on-active-background);box-shadow:inset 0 2px 2px var(--ck-color-button-on-active-shadow)}.ck.ck-button.ck-on.ck-disabled,a.ck.ck-button.ck-on.ck-disabled{background:var(--ck-color-button-on-disabled-background)}.ck.ck-button.ck-button-save,a.ck.ck-button.ck-button-save{color:var(--ck-color-button-save)}.ck.ck-button.ck-button-cancel,a.ck.ck-button.ck-button-cancel{color:var(--ck-color-button-cancel)}.ck.ck-button .ck-button__icon use,.ck.ck-button .ck-button__icon use *,a.ck.ck-button .ck-button__icon use,a.ck.ck-button .ck-button__icon use *{color:inherit}.ck.ck-button .ck-button__label,a.ck.ck-button .ck-button__label{font-size:inherit;font-weight:inherit;color:inherit;cursor:inherit;vertical-align:middle}.ck.ck-button-action,a.ck.ck-button-action{background:var(--ck-color-button-action-background)}.ck.ck-button-action:not(.ck-disabled):hover,a.ck.ck-button-action:not(.ck-disabled):hover{background:var(--ck-color-button-action-hover-background)}.ck.ck-button-action:not(.ck-disabled):active,a.ck.ck-button-action:not(.ck-disabled):active{background:var(--ck-color-button-action-active-background);box-shadow:inset 0 2px 2px var(--ck-color-button-action-active-shadow)}.ck.ck-button-action.ck-disabled,a.ck.ck-button-action.ck-disabled{background:var(--ck-color-button-action-disabled-background)}.ck.ck-button-action,a.ck.ck-button-action{color:var(--ck-color-button-action-text)}.ck.ck-button-bold,a.ck.ck-button-bold{font-weight:700}";},function(t,e,n){var i=n(68);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck.ck-dropdown{display:inline-block;position:relative}.ck.ck-dropdown .ck-dropdown__arrow{pointer-events:none;z-index:var(--ck-z-default)}.ck.ck-dropdown .ck-button.ck-dropdown__button{width:100%}.ck.ck-dropdown .ck-button.ck-dropdown__button.ck-on .ck-tooltip{display:none}.ck.ck-dropdown .ck-dropdown__panel{-webkit-backface-visibility:hidden;display:none;z-index:var(--ck-z-modal);position:absolute}.ck.ck-dropdown .ck-dropdown__panel.ck-dropdown__panel-visible{display:inline-block;will-change:transform}.ck.ck-dropdown .ck-dropdown__panel.ck-dropdown__panel_ne,.ck.ck-dropdown .ck-dropdown__panel.ck-dropdown__panel_nw{bottom:100%}.ck.ck-dropdown .ck-dropdown__panel.ck-dropdown__panel_se,.ck.ck-dropdown .ck-dropdown__panel.ck-dropdown__panel_sw{transform:translate3d(0,100%,0)}.ck.ck-dropdown .ck-dropdown__panel.ck-dropdown__panel_ne,.ck.ck-dropdown .ck-dropdown__panel.ck-dropdown__panel_se{left:0}.ck.ck-dropdown .ck-dropdown__panel.ck-dropdown__panel_nw,.ck.ck-dropdown .ck-dropdown__panel.ck-dropdown__panel_sw{right:0}:root{--ck-dropdown-arrow-size:calc(0.5*var(--ck-icon-size))}.ck.ck-dropdown{font-size:inherit}.ck.ck-dropdown .ck-dropdown__arrow{right:var(--ck-spacing-standard);width:var(--ck-dropdown-arrow-size);margin-left:var(--ck-spacing-small)}.ck.ck-dropdown.ck-disabled .ck-dropdown__arrow{opacity:var(--ck-disabled-opacity)}.ck.ck-dropdown .ck-button.ck-dropdown__button:not(.ck-button_with-text){padding-left:var(--ck-spacing-small)}.ck.ck-dropdown .ck-button.ck-dropdown__button.ck-disabled .ck-button__label{opacity:var(--ck-disabled-opacity)}.ck.ck-dropdown .ck-button.ck-dropdown__button.ck-on{border-bottom-left-radius:0;border-bottom-right-radius:0}.ck.ck-dropdown .ck-button.ck-dropdown__button .ck-button__label{width:7em;overflow:hidden;text-overflow:ellipsis}.ck.ck-dropdown__panel{box-shadow:var(--ck-drop-shadow),0 0;border-radius:0}.ck-rounded-corners .ck.ck-dropdown__panel,.ck.ck-dropdown__panel.ck-rounded-corners{border-radius:var(--ck-border-radius);border-top-left-radius:0}.ck.ck-dropdown__panel{background:var(--ck-color-dropdown-panel-background);border:1px solid var(--ck-color-dropdown-panel-border);bottom:0;min-width:100%}";},function(t,e,n){var i=n(70);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck.ck-list{-moz-user-select:none;-webkit-user-select:none;-ms-user-select:none;user-select:none;display:flex;flex-direction:column}.ck.ck-list .ck-list__item,.ck.ck-list .ck-list__separator{display:block}.ck.ck-list .ck-list__item>:focus{position:relative;z-index:var(--ck-z-default)}.ck.ck-list{border-radius:0}.ck-rounded-corners .ck.ck-list,.ck.ck-list.ck-rounded-corners{border-radius:var(--ck-border-radius)}.ck.ck-list{list-style-type:none;background:var(--ck-color-list-background)}.ck.ck-list__item{cursor:default;min-width:12em}.ck.ck-list__item .ck-button{min-height:unset;width:100%;text-align:left;border-radius:0;border:0;padding:calc(0.2*var(--ck-line-height-base)*var(--ck-font-size-base)) calc(0.4*var(--ck-line-height-base)*var(--ck-font-size-base))}.ck.ck-list__item .ck-button .ck-button__label{line-height:calc(1.2*var(--ck-line-height-base)*var(--ck-font-size-base))}.ck.ck-list__item .ck-button:active{box-shadow:none}.ck.ck-list__item .ck-button.ck-on{background:var(--ck-color-list-button-on-background);color:var(--ck-color-list-button-on-text)}.ck.ck-list__item .ck-button.ck-on:hover:not(ck-disabled){background:var(--ck-color-list-button-on-background-focus)}.ck.ck-list__item .ck-button.ck-on:active{box-shadow:none}.ck.ck-list__item .ck-button:hover:not(.ck-disabled){background:var(--ck-color-list-button-hover-background)}.ck.ck-list__item .ck-switchbutton.ck-on{background:var(--ck-color-list-background);color:inherit}.ck.ck-list__item .ck-switchbutton.ck-on:hover:not(ck-disabled){background:var(--ck-color-list-button-hover-background);color:inherit}.ck.ck-list__separator{height:1px;width:100%;background:var(--ck-color-base-border)}";},function(t,e,n){var i=n(72);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck.ck-button.ck-switchbutton .ck-button__toggle,.ck.ck-button.ck-switchbutton .ck-button__toggle .ck-button__toggle__inner{display:block}:root{--ck-switch-button-toggle-width:2.6153846154em;--ck-switch-button-toggle-inner-size:1.0769230769em;--ck-switch-button-toggle-spacing:1px}.ck.ck-button.ck-switchbutton .ck-button__label{margin-right:calc(2*var(--ck-spacing-large))}.ck.ck-button.ck-switchbutton.ck-disabled .ck-button__toggle{opacity:var(--ck-disabled-opacity)}.ck.ck-button.ck-switchbutton .ck-button__toggle{border-radius:0}.ck-rounded-corners .ck.ck-button.ck-switchbutton .ck-button__toggle,.ck.ck-button.ck-switchbutton .ck-button__toggle.ck-rounded-corners{border-radius:var(--ck-border-radius)}.ck.ck-button.ck-switchbutton .ck-button__toggle{margin-left:auto;transition:background .4s ease;width:var(--ck-switch-button-toggle-width);background:var(--ck-color-switch-button-off-background)}.ck.ck-button.ck-switchbutton .ck-button__toggle .ck-button__toggle__inner{border-radius:0}.ck-rounded-corners .ck.ck-button.ck-switchbutton .ck-button__toggle .ck-button__toggle__inner,.ck.ck-button.ck-switchbutton .ck-button__toggle .ck-button__toggle__inner.ck-rounded-corners{border-radius:var(--ck-border-radius);border-radius:calc(0.5*var(--ck-border-radius))}.ck.ck-button.ck-switchbutton .ck-button__toggle .ck-button__toggle__inner{margin:var(--ck-switch-button-toggle-spacing);width:var(--ck-switch-button-toggle-inner-size);height:var(--ck-switch-button-toggle-inner-size);background:var(--ck-color-switch-button-inner-background);transition:transform .3s ease}.ck.ck-button.ck-switchbutton.ck-on .ck-button__toggle{background:var(--ck-color-switch-button-on-background)}.ck.ck-button.ck-switchbutton.ck-on .ck-button__toggle .ck-button__toggle__inner{transform:translateX(1.3846153847em)}";},function(t,e,n){var i=n(74);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck.ck-toolbar-dropdown .ck-toolbar{flex-wrap:nowrap}.ck.ck-toolbar-dropdown .ck-dropdown__panel .ck-button:focus{z-index:calc(var(--ck-z-default) + 1)}.ck.ck-toolbar-dropdown .ck-toolbar{border:0}";},function(t,e,n){var i=n(76);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck.ck-dropdown .ck-dropdown__panel .ck-list{border-radius:0}.ck-rounded-corners .ck.ck-dropdown .ck-dropdown__panel .ck-list,.ck.ck-dropdown .ck-dropdown__panel .ck-list.ck-rounded-corners{border-radius:var(--ck-border-radius);border-top-left-radius:0}.ck.ck-dropdown .ck-dropdown__panel .ck-list .ck-list__item:first-child .ck-button{border-radius:0}.ck-rounded-corners .ck.ck-dropdown .ck-dropdown__panel .ck-list .ck-list__item:first-child .ck-button,.ck.ck-dropdown .ck-dropdown__panel .ck-list .ck-list__item:first-child .ck-button.ck-rounded-corners{border-radius:var(--ck-border-radius);border-top-left-radius:0;border-bottom-left-radius:0;border-bottom-right-radius:0}.ck.ck-dropdown .ck-dropdown__panel .ck-list .ck-list__item:last-child .ck-button{border-radius:0}.ck-rounded-corners .ck.ck-dropdown .ck-dropdown__panel .ck-list .ck-list__item:last-child .ck-button,.ck.ck-dropdown .ck-dropdown__panel .ck-list .ck-list__item:last-child .ck-button.ck-rounded-corners{border-radius:var(--ck-border-radius);border-top-left-radius:0;border-top-right-radius:0}";},function(t,e,n){var i=n(78);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".text-tiny{font-size:.7em}.text-small{font-size:.85em}.text-big{font-size:1.4em}.text-huge{font-size:1.8em}";},function(t,e,n){var i=n(80);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck.ck-splitbutton{font-size:inherit}.ck.ck-splitbutton .ck-splitbutton__action:focus{z-index:calc(var(--ck-z-default) + 1)}.ck.ck-splitbutton.ck-splitbutton_open>.ck-button .ck-tooltip{display:none}:root{--ck-color-split-button-hover-background:#ebebeb;--ck-color-split-button-hover-border:#b3b3b3}.ck.ck-splitbutton>.ck-splitbutton__action{border-radius:0}.ck-rounded-corners .ck.ck-splitbutton>.ck-splitbutton__action,.ck.ck-splitbutton>.ck-splitbutton__action.ck-rounded-corners{border-radius:var(--ck-border-radius);border-top-right-radius:unset;border-bottom-right-radius:unset}.ck.ck-splitbutton>.ck-splitbutton__arrow{min-width:unset;border-radius:0}.ck-rounded-corners .ck.ck-splitbutton>.ck-splitbutton__arrow,.ck.ck-splitbutton>.ck-splitbutton__arrow.ck-rounded-corners{border-radius:var(--ck-border-radius);border-top-left-radius:unset;border-bottom-left-radius:unset}.ck.ck-splitbutton>.ck-splitbutton__arrow svg{width:var(--ck-dropdown-arrow-size)}.ck.ck-splitbutton.ck-splitbutton_open>.ck-button:not(.ck-on):not(:hover),.ck.ck-splitbutton:hover>.ck-button:not(.ck-on):not(:hover){background:var(--ck-color-split-button-hover-background)}.ck.ck-splitbutton.ck-splitbutton_open>.ck-splitbutton__arrow,.ck.ck-splitbutton:hover>.ck-splitbutton__arrow{border-left-color:var(--ck-color-split-button-hover-border)}.ck.ck-splitbutton.ck-splitbutton_open{border-radius:0}.ck-rounded-corners .ck.ck-splitbutton.ck-splitbutton_open,.ck.ck-splitbutton.ck-splitbutton_open.ck-rounded-corners{border-radius:var(--ck-border-radius)}.ck-rounded-corners .ck.ck-splitbutton.ck-splitbutton_open>.ck-splitbutton__action,.ck.ck-splitbutton.ck-splitbutton_open.ck-rounded-corners>.ck-splitbutton__action{border-bottom-left-radius:0}.ck-rounded-corners .ck.ck-splitbutton.ck-splitbutton_open>.ck-splitbutton__arrow,.ck.ck-splitbutton.ck-splitbutton_open.ck-rounded-corners>.ck-splitbutton__arrow{border-bottom-right-radius:0}";},function(t,e,n){var i=n(82);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=":root{--ck-highlight-marker-yellow:#fdfd77;--ck-highlight-marker-green:#63f963;--ck-highlight-marker-pink:#fc7999;--ck-highlight-marker-blue:#72cdfd;--ck-highlight-pen-red:#e91313;--ck-highlight-pen-green:#180}.marker-yellow{background-color:var(--ck-highlight-marker-yellow)}.marker-green{background-color:var(--ck-highlight-marker-green)}.marker-pink{background-color:var(--ck-highlight-marker-pink)}.marker-blue{background-color:var(--ck-highlight-marker-blue)}.pen-red{color:var(--ck-highlight-pen-red)}.pen-green,.pen-red{background-color:transparent}.pen-green{color:var(--ck-highlight-pen-green)}";},function(t,e,n){var i=n(84);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck-content blockquote{overflow:hidden;padding-right:1.5em;padding-left:1.5em;margin-left:0;font-style:italic;border-left:5px solid #ccc}";},function(t,e,n){var i=n(86);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck .ck-widget.ck-widget_selectable{position:relative}.ck .ck-widget.ck-widget_selectable .ck-widget__selection-handler{visibility:hidden;position:absolute}.ck .ck-widget.ck-widget_selectable .ck-widget__selection-handler .ck-icon{display:block}.ck .ck-widget.ck-widget_selectable.ck-widget_selected .ck-widget__selection-handler,.ck .ck-widget.ck-widget_selectable:hover .ck-widget__selection-handler{visibility:visible}:root{--ck-widget-outline-thickness:3px;--ck-widget-handler-icon-size:16px;--ck-widget-handler-animation-duration:200ms;--ck-widget-handler-animation-curve:ease;--ck-color-widget-blurred-border:#dedede;--ck-color-widget-hover-border:#ffc83d;--ck-color-widget-editable-focus-background:var(--ck-color-base-background);--ck-color-widget-drag-handler-icon-color:var(--ck-color-base-background)}.ck .ck-widget{outline-width:var(--ck-widget-outline-thickness);outline-style:solid;outline-color:transparent;transition:outline-color var(--ck-widget-handler-animation-duration) var(--ck-widget-handler-animation-curve)}.ck .ck-widget.ck-widget_selected,.ck .ck-widget.ck-widget_selected:hover{outline:var(--ck-widget-outline-thickness) solid var(--ck-color-focus-border)}.ck .ck-widget:hover{outline-color:var(--ck-color-widget-hover-border)}.ck .ck-editor__nested-editable{border:1px solid transparent}.ck .ck-editor__nested-editable.ck-editor__nested-editable_focused,.ck .ck-editor__nested-editable:focus{outline:none;border:var(--ck-focus-ring);box-shadow:var(--ck-inner-shadow),0 0;background-color:var(--ck-color-widget-editable-focus-background)}.ck .ck-widget.ck-widget_selectable .ck-widget__selection-handler{padding:4px;box-sizing:border-box;background-color:transparent;opacity:0;transition:background-color var(--ck-widget-handler-animation-duration) var(--ck-widget-handler-animation-curve),visibility var(--ck-widget-handler-animation-duration) var(--ck-widget-handler-animation-curve),opacity var(--ck-widget-handler-animation-duration) var(--ck-widget-handler-animation-curve);border-radius:var(--ck-border-radius) var(--ck-border-radius) 0 0;transform:translateY(-100%);left:calc(0px - var(--ck-widget-outline-thickness))}.ck .ck-widget.ck-widget_selectable .ck-widget__selection-handler:hover .ck-icon .ck-icon__selected-indicator{opacity:1}.ck .ck-widget.ck-widget_selectable .ck-widget__selection-handler .ck-icon{width:var(--ck-widget-handler-icon-size);height:var(--ck-widget-handler-icon-size);color:var(--ck-color-widget-drag-handler-icon-color)}.ck .ck-widget.ck-widget_selectable .ck-widget__selection-handler .ck-icon .ck-icon__selected-indicator{opacity:0;transition:opacity .3s var(--ck-widget-handler-animation-curve)}.ck .ck-widget.ck-widget_selectable.ck-widget_selected .ck-widget__selection-handler,.ck .ck-widget.ck-widget_selectable.ck-widget_selected:hover .ck-widget__selection-handler{opacity:1;background-color:var(--ck-color-focus-border)}.ck .ck-widget.ck-widget_selectable.ck-widget_selected .ck-widget__selection-handler .ck-icon .ck-icon__selected-indicator,.ck .ck-widget.ck-widget_selectable.ck-widget_selected:hover .ck-widget__selection-handler .ck-icon .ck-icon__selected-indicator{opacity:1}.ck .ck-widget.ck-widget_selectable:hover .ck-widget__selection-handler{opacity:1;background-color:var(--ck-color-widget-hover-border)}.ck-editor__editable.ck-blurred .ck-widget.ck-widget_selected,.ck-editor__editable.ck-blurred .ck-widget.ck-widget_selected:hover{outline-color:var(--ck-color-widget-blurred-border)}.ck-editor__editable.ck-blurred .ck-widget.ck-widget_selected .ck-widget__selection-handler,.ck-editor__editable.ck-blurred .ck-widget.ck-widget_selected .ck-widget__selection-handler:hover,.ck-editor__editable.ck-blurred .ck-widget.ck-widget_selected:hover .ck-widget__selection-handler,.ck-editor__editable.ck-blurred .ck-widget.ck-widget_selected:hover .ck-widget__selection-handler:hover{background:var(--ck-color-widget-blurred-border)}.ck-editor__editable.ck-read-only .ck-widget{--ck-widget-outline-thickness:0}";},function(t,e,n){var i=n(88);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck.ck-label{display:block}.ck.ck-voice-label{display:none}.ck.ck-label{font-weight:700}";},function(t,e,n){var i=n(90);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck.ck-labeled-input .ck-labeled-input__status{font-size:var(--ck-font-size-small);margin-top:var(--ck-spacing-small);white-space:normal}.ck.ck-labeled-input .ck-labeled-input__status_error{color:var(--ck-color-base-error)}";},function(t,e,n){var i=n(92);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=":root{--ck-input-text-width:18em}.ck.ck-input-text{border-radius:0}.ck-rounded-corners .ck.ck-input-text,.ck.ck-input-text.ck-rounded-corners{border-radius:var(--ck-border-radius)}.ck.ck-input-text{box-shadow:var(--ck-inner-shadow),0 0;background:var(--ck-color-input-background);border:1px solid var(--ck-color-input-border);padding:var(--ck-spacing-extra-tiny) var(--ck-spacing-medium);min-width:var(--ck-input-text-width);min-height:var(--ck-ui-component-min-height);transition-property:box-shadow,border;transition:.2s ease-in-out}.ck.ck-input-text:focus{outline:none;border:var(--ck-focus-ring);box-shadow:var(--ck-focus-outer-shadow),var(--ck-inner-shadow)}.ck.ck-input-text[readonly]{border:1px solid var(--ck-color-input-disabled-border);background:var(--ck-color-input-disabled-background);color:var(--ck-color-input-disabled-text)}.ck.ck-input-text[readonly]:focus{box-shadow:var(--ck-focus-disabled-outer-shadow),var(--ck-inner-shadow)}.ck.ck-input-text.ck-error{border-color:var(--ck-color-input-error-border);animation:ck-text-input-shake .3s ease both}.ck.ck-input-text.ck-error:focus{box-shadow:var(--ck-focus-error-outer-shadow),var(--ck-inner-shadow)}@keyframes ck-text-input-shake{20%{transform:translateX(-2px)}40%{transform:translateX(2px)}60%{transform:translateX(-1px)}80%{transform:translateX(1px)}}";},function(t,e,n){var i=n(94);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck.ck-text-alternative-form{display:flex;flex-direction:row;flex-wrap:nowrap}.ck.ck-text-alternative-form .ck-labeled-input{display:inline-block}.ck.ck-text-alternative-form .ck-label{display:none}@media screen and (max-width:600px){.ck.ck-text-alternative-form{flex-wrap:wrap}.ck.ck-text-alternative-form .ck-labeled-input{flex-basis:100%}.ck.ck-text-alternative-form .ck-button{flex-basis:50%}}.ck.ck-text-alternative-form{padding:var(--ck-spacing-standard)}.ck.ck-text-alternative-form:focus{outline:none}.ck.ck-text-alternative-form>:not(:first-child){margin-left:var(--ck-spacing-standard)}@media screen and (max-width:600px){.ck.ck-text-alternative-form{padding:0;width:calc(0.8*var(--ck-input-text-width))}.ck.ck-text-alternative-form .ck-labeled-input{margin:var(--ck-spacing-standard) var(--ck-spacing-standard) 0}.ck.ck-text-alternative-form .ck-labeled-input .ck-input-text{min-width:0;width:100%}.ck.ck-text-alternative-form .ck-button{padding:var(--ck-spacing-standard);margin-top:var(--ck-spacing-standard);margin-left:0;border-radius:0;border:0;border-top:1px solid var(--ck-color-base-border)}.ck.ck-text-alternative-form .ck-button:first-of-type{border-right:1px solid var(--ck-color-base-border)}}";},function(t,e,n){var i=n(96);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=':root{--ck-balloon-panel-arrow-z-index:calc(var(--ck-z-default) - 3)}.ck.ck-balloon-panel{display:none;position:absolute;z-index:var(--ck-z-modal)}.ck.ck-balloon-panel.ck-balloon-panel_with-arrow:after,.ck.ck-balloon-panel.ck-balloon-panel_with-arrow:before{content:"";position:absolute}.ck.ck-balloon-panel.ck-balloon-panel_with-arrow:before{z-index:var(--ck-balloon-panel-arrow-z-index)}.ck.ck-balloon-panel.ck-balloon-panel_with-arrow:after{z-index:calc(var(--ck-balloon-panel-arrow-z-index) + 1)}.ck.ck-balloon-panel[class*=arrow_n]:before{z-index:var(--ck-balloon-panel-arrow-z-index)}.ck.ck-balloon-panel[class*=arrow_n]:after{z-index:calc(var(--ck-balloon-panel-arrow-z-index) + 1)}.ck.ck-balloon-panel[class*=arrow_s]:before{z-index:var(--ck-balloon-panel-arrow-z-index)}.ck.ck-balloon-panel[class*=arrow_s]:after{z-index:calc(var(--ck-balloon-panel-arrow-z-index) + 1)}.ck.ck-balloon-panel.ck-balloon-panel_visible{display:block}:root{--ck-balloon-arrow-offset:2px;--ck-balloon-arrow-height:10px;--ck-balloon-arrow-half-width:8px}.ck.ck-balloon-panel{border-radius:0}.ck-rounded-corners .ck.ck-balloon-panel,.ck.ck-balloon-panel.ck-rounded-corners{border-radius:var(--ck-border-radius)}.ck.ck-balloon-panel{box-shadow:var(--ck-drop-shadow),0 0;min-height:15px;background:var(--ck-color-panel-background);border:1px solid var(--ck-color-panel-border)}.ck.ck-balloon-panel.ck-balloon-panel_with-arrow:after,.ck.ck-balloon-panel.ck-balloon-panel_with-arrow:before{width:0;height:0;border-style:solid}.ck.ck-balloon-panel[class*=arrow_n]:after,.ck.ck-balloon-panel[class*=arrow_n]:before{border-left-width:var(--ck-balloon-arrow-half-width);border-bottom-width:var(--ck-balloon-arrow-height);border-right-width:var(--ck-balloon-arrow-half-width);border-top-width:0}.ck.ck-balloon-panel[class*=arrow_n]:before{border-bottom-color:var(--ck-color-panel-border)}.ck.ck-balloon-panel[class*=arrow_n]:after,.ck.ck-balloon-panel[class*=arrow_n]:before{border-left-color:transparent;border-right-color:transparent;border-top-color:transparent}.ck.ck-balloon-panel[class*=arrow_n]:after{border-bottom-color:var(--ck-color-panel-background);margin-top:var(--ck-balloon-arrow-offset)}.ck.ck-balloon-panel[class*=arrow_s]:after,.ck.ck-balloon-panel[class*=arrow_s]:before{border-left-width:var(--ck-balloon-arrow-half-width);border-bottom-width:0;border-right-width:var(--ck-balloon-arrow-half-width);border-top-width:var(--ck-balloon-arrow-height)}.ck.ck-balloon-panel[class*=arrow_s]:before{border-top-color:var(--ck-color-panel-border)}.ck.ck-balloon-panel[class*=arrow_s]:after,.ck.ck-balloon-panel[class*=arrow_s]:before{border-left-color:transparent;border-bottom-color:transparent;border-right-color:transparent}.ck.ck-balloon-panel[class*=arrow_s]:after{border-top-color:var(--ck-color-panel-background);margin-bottom:var(--ck-balloon-arrow-offset)}.ck.ck-balloon-panel.ck-balloon-panel_arrow_n:after,.ck.ck-balloon-panel.ck-balloon-panel_arrow_n:before{left:50%;margin-left:calc(-1*var(--ck-balloon-arrow-half-width));top:calc(-1*var(--ck-balloon-arrow-height))}.ck.ck-balloon-panel.ck-balloon-panel_arrow_nw:after,.ck.ck-balloon-panel.ck-balloon-panel_arrow_nw:before{left:calc(2*var(--ck-balloon-arrow-half-width));top:calc(-1*var(--ck-balloon-arrow-height))}.ck.ck-balloon-panel.ck-balloon-panel_arrow_ne:after,.ck.ck-balloon-panel.ck-balloon-panel_arrow_ne:before{right:calc(2*var(--ck-balloon-arrow-half-width));top:calc(-1*var(--ck-balloon-arrow-height))}.ck.ck-balloon-panel.ck-balloon-panel_arrow_s:after,.ck.ck-balloon-panel.ck-balloon-panel_arrow_s:before{left:50%;margin-left:calc(-1*var(--ck-balloon-arrow-half-width));bottom:calc(-1*var(--ck-balloon-arrow-height))}.ck.ck-balloon-panel.ck-balloon-panel_arrow_sw:after,.ck.ck-balloon-panel.ck-balloon-panel_arrow_sw:before{left:calc(2*var(--ck-balloon-arrow-half-width));bottom:calc(-1*var(--ck-balloon-arrow-height))}.ck.ck-balloon-panel.ck-balloon-panel_arrow_se:after,.ck.ck-balloon-panel.ck-balloon-panel_arrow_se:before{right:calc(2*var(--ck-balloon-arrow-half-width));bottom:calc(-1*var(--ck-balloon-arrow-height))}';},function(t,e,n){var i=n(98);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck-content .image{clear:both;text-align:center;margin:1em 0}.ck-content .image>img{display:block;margin:0 auto;max-width:100%}";},function(t,e,n){var i=n(100);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck-content .image{position:relative;overflow:hidden}.ck-content .image .ck-progress-bar{position:absolute;top:0;left:0}:root{--ck-image-upload-progress-line-width:30px}.ck-content .image.ck-appear{animation:fadeIn .7s}.ck-content .image .ck-progress-bar{height:2px;width:0;background:var(--ck-color-upload-bar-background);transition:width .1s}@keyframes fadeIn{0%{opacity:0}to{opacity:1}}";},function(t,e,n){var i=n(102);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports='.ck-image-upload-complete-icon{display:block;position:absolute;top:10px;right:10px;border-radius:50%}.ck-image-upload-complete-icon:after{content:"";position:absolute}:root{--ck-color-image-upload-icon:#fff;--ck-color-image-upload-icon-background:#008a00;--ck-image-upload-icon-size:20px;--ck-image-upload-icon-width:2px}.ck-image-upload-complete-icon{width:var(--ck-image-upload-icon-size);height:var(--ck-image-upload-icon-size);opacity:0;background:var(--ck-color-image-upload-icon-background);animation-name:ck-upload-complete-icon-show,ck-upload-complete-icon-hide;animation-fill-mode:forwards,forwards;animation-duration:.5s,.5s;font-size:var(--ck-image-upload-icon-size);animation-delay:0ms,3s}.ck-image-upload-complete-icon:after{left:25%;top:50%;opacity:0;height:0;width:0;transform:scaleX(-1) rotate(135deg);transform-origin:left top;border-top:var(--ck-image-upload-icon-width) solid var(--ck-color-image-upload-icon);border-right:var(--ck-image-upload-icon-width) solid var(--ck-color-image-upload-icon);animation-name:ck-upload-complete-icon-check;animation-duration:.5s;animation-delay:.5s;animation-fill-mode:forwards;box-sizing:border-box}@keyframes ck-upload-complete-icon-show{0%{opacity:0}to{opacity:1}}@keyframes ck-upload-complete-icon-hide{0%{opacity:1}to{opacity:0}}@keyframes ck-upload-complete-icon-check{0%{opacity:1;width:0;height:0}33%{width:.3em;height:0}to{opacity:1;width:.3em;height:.45em}}';},function(t,e,n){var i=n(104);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports='.ck .ck-upload-placeholder-loader{position:absolute;display:flex;align-items:center;justify-content:center;top:0;left:0}.ck .ck-upload-placeholder-loader:before{content:"";position:relative}:root{--ck-color-upload-placeholder-loader:#b3b3b3;--ck-upload-placeholder-loader-size:32px}.ck .ck-image-upload-placeholder{width:100%;margin:0}.ck .ck-upload-placeholder-loader{width:100%;height:100%}.ck .ck-upload-placeholder-loader:before{width:var(--ck-upload-placeholder-loader-size);height:var(--ck-upload-placeholder-loader-size);border-radius:50%;border-top:3px solid var(--ck-color-upload-placeholder-loader);border-right:2px solid transparent;animation:ck-upload-placeholder-loader 1s linear infinite}@keyframes ck-upload-placeholder-loader{to{transform:rotate(1turn)}}';},function(t,e){t.exports=".ck.ck-heading_heading1{font-size:20px}.ck.ck-heading_heading2{font-size:17px}.ck.ck-heading_heading3{font-size:14px}.ck[class*=ck-heading_heading]{font-weight:700}.ck.ck-dropdown.ck-heading-dropdown .ck-dropdown__button .ck-button__label{width:8em}.ck.ck-dropdown.ck-heading-dropdown .ck-dropdown__panel .ck-list__item{min-width:18em}";},function(t,e,n){var i=n(107);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck.ck-placeholder:before,.ck .ck-placeholder:before{content:attr(data-placeholder);pointer-events:none;cursor:text;color:var(--ck-color-engine-placeholder-text)}";},function(t,e,n){var i=n(109);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck-content .image>figcaption{color:#333;background-color:#f7f7f7;padding:.6em;font-size:.75em;outline-offset:-1px}";},function(t,e,n){var i=n(111);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=":root{--ck-image-style-spacing:1.5em}.ck-content .image-style-align-center,.ck-content .image-style-align-left,.ck-content .image-style-align-right,.ck-content .image-style-side{max-width:50%}.ck-content .image-style-side{float:right;margin-left:var(--ck-image-style-spacing)}.ck-content .image-style-align-left{float:left;margin-right:var(--ck-image-style-spacing)}.ck-content .image-style-align-center{margin-left:auto;margin-right:auto}.ck-content .image-style-align-right{float:right;margin-left:var(--ck-image-style-spacing)}";},function(t,e,n){var i=n(113);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck .ck-link_selected{background:var(--ck-color-link-selected-background)}";},function(t,e,n){var i=n(115);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck.ck-link-form{display:flex;flex-direction:row;flex-wrap:nowrap}.ck.ck-link-form .ck-label{display:none}@media screen and (max-width:600px){.ck.ck-link-form{flex-wrap:wrap}.ck.ck-link-form .ck-labeled-input{flex-basis:100%}.ck.ck-link-form .ck-button{flex-basis:50%}}.ck.ck-link-form{padding:var(--ck-spacing-standard)}.ck.ck-link-form:focus{outline:none}.ck.ck-link-form>:not(:first-child){margin-left:var(--ck-spacing-standard)}@media screen and (max-width:600px){.ck.ck-link-form{padding:0;width:calc(0.8*var(--ck-input-text-width))}.ck.ck-link-form .ck-labeled-input{margin:var(--ck-spacing-standard) var(--ck-spacing-standard) 0}.ck.ck-link-form .ck-labeled-input .ck-input-text{min-width:0;width:100%}.ck.ck-link-form .ck-button{padding:var(--ck-spacing-standard);margin-top:var(--ck-spacing-standard);margin-left:0;border-radius:0;border:0;border-top:1px solid var(--ck-color-base-border)}.ck.ck-link-form .ck-button:first-of-type{border-right:1px solid var(--ck-color-base-border)}}";},function(t,e,n){var i=n(117);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck.ck-link-actions{display:flex;flex-direction:row;flex-wrap:nowrap}.ck.ck-link-actions .ck-link-actions__preview{display:inline-block}.ck.ck-link-actions .ck-link-actions__preview .ck-button__label{overflow:hidden}@media screen and (max-width:600px){.ck.ck-link-actions{flex-wrap:wrap}.ck.ck-link-actions .ck-link-actions__preview{flex-basis:100%}.ck.ck-link-actions .ck-button:not(.ck-link-actions__preview){flex-basis:50%}}.ck.ck-link-actions{padding:var(--ck-spacing-standard)}.ck.ck-link-actions .ck-button.ck-link-actions__preview{padding-left:0;padding-right:0}.ck.ck-link-actions .ck-button.ck-link-actions__preview,.ck.ck-link-actions .ck-button.ck-link-actions__preview:active,.ck.ck-link-actions .ck-button.ck-link-actions__preview:focus,.ck.ck-link-actions .ck-button.ck-link-actions__preview:hover{background:none}.ck.ck-link-actions .ck-button.ck-link-actions__preview:active{box-shadow:none}.ck.ck-link-actions .ck-button.ck-link-actions__preview:focus .ck-button__label{text-decoration:underline}.ck.ck-link-actions .ck-button.ck-link-actions__preview .ck-button__label{padding:0 var(--ck-spacing-medium);color:var(--ck-color-link-default);text-overflow:ellipsis;cursor:pointer;max-width:var(--ck-input-text-width);min-width:3em;text-align:center}.ck.ck-link-actions .ck-button.ck-link-actions__preview .ck-button__label:hover{text-decoration:underline}.ck.ck-link-actions:focus{outline:none}.ck.ck-link-actions .ck-button:not(.ck-link-actions__preview){margin-left:var(--ck-spacing-standard)}@media screen and (max-width:600px){.ck.ck-link-actions{padding:0;width:calc(0.8*var(--ck-input-text-width))}.ck.ck-link-actions .ck-button.ck-link-actions__preview{margin:var(--ck-spacing-standard) var(--ck-spacing-standard) 0}.ck.ck-link-actions .ck-button.ck-link-actions__preview .ck-button__label{min-width:0;max-width:100%}.ck.ck-link-actions .ck-button:not(.ck-link-actions__preview){padding:var(--ck-spacing-standard);margin-top:var(--ck-spacing-standard);margin-left:0;border-radius:0;border:0;border-top:1px solid var(--ck-color-base-border)}.ck.ck-link-actions .ck-button:not(.ck-link-actions__preview):first-of-type{border-right:1px solid var(--ck-color-base-border)}}";},function(t,e,n){var i=n(119);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports='.ck-media__wrapper .ck-media__placeholder{display:flex;flex-direction:column;align-items:center}.ck-media__wrapper .ck-media__placeholder .ck-media__placeholder__url .ck-tooltip{display:block}@media (hover:none){.ck-media__wrapper .ck-media__placeholder .ck-media__placeholder__url .ck-tooltip{display:none}}.ck-media__wrapper .ck-media__placeholder .ck-media__placeholder__url{max-width:100%;position:relative}.ck-media__wrapper .ck-media__placeholder .ck-media__placeholder__url:hover .ck-tooltip{visibility:visible;opacity:1}.ck-media__wrapper .ck-media__placeholder .ck-media__placeholder__url .ck-media__placeholder__url__text{overflow:hidden;display:block}.ck-media__wrapper[data-oembed-url*="facebook.com"] .ck-media__placeholder__icon *,.ck-media__wrapper[data-oembed-url*="google.com/maps"] .ck-media__placeholder__icon *,.ck-media__wrapper[data-oembed-url*="instagram.com"] .ck-media__placeholder__icon *,.ck-media__wrapper[data-oembed-url*="twitter.com"] .ck-media__placeholder__icon *{display:none}[contenteditable=true] .ck-media__wrapper>:not(.ck-media__placeholder){pointer-events:none}:root{--ck-media-embed-placeholder-icon-size:3em;--ck-color-media-embed-placeholder-url-text:#757575;--ck-color-media-embed-placeholder-url-text-hover:var(--ck-color-base-text)}.ck-media__wrapper{margin:0 auto}.ck-media__wrapper .ck-media__placeholder{padding:calc(3*var(--ck-spacing-standard));background:var(--ck-color-base-foreground)}.ck-media__wrapper .ck-media__placeholder .ck-media__placeholder__icon{min-width:var(--ck-media-embed-placeholder-icon-size);height:var(--ck-media-embed-placeholder-icon-size);margin-bottom:var(--ck-spacing-large);background-position:50%;background-size:cover}.ck-media__wrapper .ck-media__placeholder .ck-media__placeholder__icon .ck-icon{width:100%;height:100%}.ck-media__wrapper .ck-media__placeholder .ck-media__placeholder__url .ck-media__placeholder__url__text{color:var(--ck-color-media-embed-placeholder-url-text);white-space:nowrap;text-align:center;font-style:italic;text-overflow:ellipsis}.ck-media__wrapper .ck-media__placeholder .ck-media__placeholder__url .ck-media__placeholder__url__text:hover{color:var(--ck-color-media-embed-placeholder-url-text-hover);cursor:pointer;text-decoration:underline}.ck-media__wrapper[data-oembed-url*="open.spotify.com"]{max-width:300px;max-height:380px}.ck-media__wrapper[data-oembed-url*="twitter.com"] .ck.ck-media__placeholder{background:linear-gradient(90deg,#71c6f4,#0d70a5)}.ck-media__wrapper[data-oembed-url*="twitter.com"] .ck.ck-media__placeholder .ck-media__placeholder__icon{background-image:url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MDAgNDAwIj48cGF0aCBkPSJNNDAwIDIwMGMwIDExMC41LTg5LjUgMjAwLTIwMCAyMDBTMCAzMTAuNSAwIDIwMCA4OS41IDAgMjAwIDBzMjAwIDg5LjUgMjAwIDIwMHpNMTYzLjQgMzA1LjVjODguNyAwIDEzNy4yLTczLjUgMTM3LjItMTM3LjIgMC0yLjEgMC00LjItLjEtNi4yIDkuNC02LjggMTcuNi0xNS4zIDI0LjEtMjUtOC42IDMuOC0xNy45IDYuNC0yNy43IDcuNiAxMC02IDE3LjYtMTUuNCAyMS4yLTI2LjctOS4zIDUuNS0xOS42IDkuNS0zMC42IDExLjctOC44LTkuNC0yMS4zLTE1LjItMzUuMi0xNS4yLTI2LjYgMC00OC4yIDIxLjYtNDguMiA0OC4yIDAgMy44LjQgNy41IDEuMyAxMS00MC4xLTItNzUuNi0yMS4yLTk5LjQtNTAuNC00LjEgNy4xLTYuNSAxNS40LTYuNSAyNC4yIDAgMTYuNyA4LjUgMzEuNSAyMS41IDQwLjEtNy45LS4yLTE1LjMtMi40LTIxLjgtNnYuNmMwIDIzLjQgMTYuNiA0Mi44IDM4LjcgNDcuMy00IDEuMS04LjMgMS43LTEyLjcgMS43LTMuMSAwLTYuMS0uMy05LjEtLjkgNi4xIDE5LjIgMjMuOSAzMy4xIDQ1IDMzLjUtMTYuNSAxMi45LTM3LjMgMjAuNi01OS45IDIwLjYtMy45IDAtNy43LS4yLTExLjUtLjcgMjEuMSAxMy44IDQ2LjUgMjEuOCA3My43IDIxLjgiIGZpbGw9IiNmZmYiLz48L3N2Zz4=)}.ck-media__wrapper[data-oembed-url*="twitter.com"] .ck.ck-media__placeholder .ck-media__placeholder__url__text{color:#b8e6ff}.ck-media__wrapper[data-oembed-url*="twitter.com"] .ck.ck-media__placeholder .ck-media__placeholder__url__text:hover{color:#fff}.ck-media__wrapper[data-oembed-url*="google.com/maps"] .ck-media__placeholder__icon{background-image:url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNTAuMzc4IiBoZWlnaHQ9IjI1NC4xNjciIHZpZXdCb3g9IjAgMCA2Ni4yNDYgNjcuMjQ4Ij48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMTcyLjUzMSAtMjE4LjQ1NSkgc2NhbGUoLjk4MDEyKSI+PHJlY3Qgcnk9IjUuMjM4IiByeD0iNS4yMzgiIHk9IjIzMS4zOTkiIHg9IjE3Ni4wMzEiIGhlaWdodD0iNjAuMDk5IiB3aWR0aD0iNjAuMDk5IiBmaWxsPSIjMzRhNjY4IiBwYWludC1vcmRlcj0ibWFya2VycyBzdHJva2UgZmlsbCIvPjxwYXRoIGQ9Ik0yMDYuNDc3IDI2MC45bC0yOC45ODcgMjguOTg3YTUuMjE4IDUuMjE4IDAgMCAwIDMuNzggMS42MWg0OS42MjFjMS42OTQgMCAzLjE5LS43OTggNC4xNDYtMi4wMzd6IiBmaWxsPSIjNWM4OGM1Ii8+PHBhdGggZD0iTTIyNi43NDIgMjIyLjk4OGMtOS4yNjYgMC0xNi43NzcgNy4xNy0xNi43NzcgMTYuMDE0LjAwNyAyLjc2Mi42NjMgNS40NzQgMi4wOTMgNy44NzUuNDMuNzAzLjgzIDEuNDA4IDEuMTkgMi4xMDcuMzMzLjUwMi42NSAxLjAwNS45NSAxLjUwOC4zNDMuNDc3LjY3My45NTcuOTg4IDEuNDQgMS4zMSAxLjc2OSAyLjUgMy41MDIgMy42MzcgNS4xNjguNzkzIDEuMjc1IDEuNjgzIDIuNjQgMi40NjYgMy45OSAyLjM2MyA0LjA5NCA0LjAwNyA4LjA5MiA0LjYgMTMuOTE0di4wMTJjLjE4Mi40MTIuNTE2LjY2Ni44NzkuNjY3LjQwMy0uMDAxLjc2OC0uMzE0LjkzLS43OTkuNjAzLTUuNzU2IDIuMjM4LTkuNzI5IDQuNTg1LTEzLjc5NC43ODItMS4zNSAxLjY3My0yLjcxNSAyLjQ2NS0zLjk5IDEuMTM3LTEuNjY2IDIuMzI4LTMuNCAzLjYzOC01LjE2OS4zMTUtLjQ4Mi42NDUtLjk2Mi45ODgtMS40MzkuMy0uNTAzLjYxNy0xLjAwNi45NS0xLjUwOC4zNTktLjcuNzYtMS40MDQgMS4xOS0yLjEwNyAxLjQyNi0yLjQwMiAyLTUuMTE0IDIuMDA0LTcuODc1IDAtOC44NDQtNy41MTEtMTYuMDE0LTE2Ljc3Ni0xNi4wMTR6IiBmaWxsPSIjZGQ0YjNlIiBwYWludC1vcmRlcj0ibWFya2VycyBzdHJva2UgZmlsbCIvPjxlbGxpcHNlIHJ5PSI1LjU2NCIgcng9IjUuODI4IiBjeT0iMjM5LjAwMiIgY3g9IjIyNi43NDIiIGZpbGw9IiM4MDJkMjciIHBhaW50LW9yZGVyPSJtYXJrZXJzIHN0cm9rZSBmaWxsIi8+PHBhdGggZD0iTTE5MC4zMDEgMjM3LjI4M2MtNC42NyAwLTguNDU3IDMuODUzLTguNDU3IDguNjA2czMuNzg2IDguNjA3IDguNDU3IDguNjA3YzMuMDQzIDAgNC44MDYtLjk1OCA2LjMzNy0yLjUxNiAxLjUzLTEuNTU3IDIuMDg3LTMuOTEzIDIuMDg3LTYuMjkgMC0uMzYyLS4wMjMtLjcyMi0uMDY0LTEuMDc5aC04LjI1N3YzLjA0M2g0Ljg1Yy0uMTk3Ljc1OS0uNTMxIDEuNDUtMS4wNTggMS45ODYtLjk0Mi45NTgtMi4wMjggMS41NDgtMy45MDEgMS41NDgtMi44NzYgMC01LjIwOC0yLjM3Mi01LjIwOC01LjI5OSAwLTIuOTI2IDIuMzMyLTUuMjk5IDUuMjA4LTUuMjk5IDEuMzk5IDAgMi42MTguNDA3IDMuNTg0IDEuMjkzbDIuMzgxLTIuMzhjMC0uMDAyLS4wMDMtLjAwNC0uMDA0LS4wMDUtMS41ODgtMS41MjQtMy42Mi0yLjIxNS01Ljk1NS0yLjIxNXptNC40MyA1LjY2bC4wMDMuMDA2di0uMDAzeiIgZmlsbD0iI2ZmZiIgcGFpbnQtb3JkZXI9Im1hcmtlcnMgc3Ryb2tlIGZpbGwiLz48cGF0aCBkPSJNMjE1LjE4NCAyNTEuOTI5bC03Ljk4IDcuOTc5IDI4LjQ3NyAyOC40NzVhNS4yMzMgNS4yMzMgMCAwIDAgLjQ0OS0yLjEyM3YtMzEuMTY1Yy0uNDY5LjY3NS0uOTM0IDEuMzQ5LTEuMzgyIDIuMDA1LS43OTIgMS4yNzUtMS42ODIgMi42NC0yLjQ2NSAzLjk5LTIuMzQ3IDQuMDY1LTMuOTgyIDguMDM4LTQuNTg1IDEzLjc5NC0uMTYyLjQ4NS0uNTI3Ljc5OC0uOTMuNzk5LS4zNjMtLjAwMS0uNjk3LS4yNTUtLjg3OS0uNjY3di0uMDEyYy0uNTkzLTUuODIyLTIuMjM3LTkuODItNC42LTEzLjkxNC0uNzgzLTEuMzUtMS42NzMtMi43MTUtMi40NjYtMy45OS0xLjEzNy0xLjY2Ni0yLjMyNy0zLjQtMy42MzctNS4xNjlsLS4wMDItLjAwM3oiIGZpbGw9IiNjM2MzYzMiLz48cGF0aCBkPSJNMjEyLjk4MyAyNDguNDk1bC0zNi45NTIgMzYuOTUzdi44MTJhNS4yMjcgNS4yMjcgMCAwIDAgNS4yMzggNS4yMzhoMS4wMTVsMzUuNjY2LTM1LjY2NmExMzYuMjc1IDEzNi4yNzUgMCAwIDAtMi43NjQtMy45IDM3LjU3NSAzNy41NzUgMCAwIDAtLjk4OS0xLjQ0IDM1LjEyNyAzNS4xMjcgMCAwIDAtLjk1LTEuNTA4Yy0uMDgzLS4xNjItLjE3Ni0uMzI2LS4yNjQtLjQ4OXoiIGZpbGw9IiNmZGRjNGYiIHBhaW50LW9yZGVyPSJtYXJrZXJzIHN0cm9rZSBmaWxsIi8+PHBhdGggZD0iTTIxMS45OTggMjYxLjA4M2wtNi4xNTIgNi4xNTEgMjQuMjY0IDI0LjI2NGguNzgxYTUuMjI3IDUuMjI3IDAgMCAwIDUuMjM5LTUuMjM4di0xLjA0NXoiIGZpbGw9IiNmZmYiIHBhaW50LW9yZGVyPSJtYXJrZXJzIHN0cm9rZSBmaWxsIi8+PC9nPjwvc3ZnPg==)}.ck-media__wrapper[data-oembed-url*="facebook.com"] .ck-media__placeholder{background:#4268b3}.ck-media__wrapper[data-oembed-url*="facebook.com"] .ck-media__placeholder .ck-media__placeholder__icon{background-image:url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAyNCIgaGVpZ2h0PSIxMDI0IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik05NjcuNDg0IDBINTYuNTE3QzI1LjMwNCAwIDAgMjUuMzA0IDAgNTYuNTE3djkxMC45NjZDMCA5OTguNjk0IDI1LjI5NyAxMDI0IDU2LjUyMiAxMDI0SDU0N1Y2MjhINDE0VjQ3M2gxMzNWMzU5LjAyOWMwLTEzMi4yNjIgODAuNzczLTIwNC4yODIgMTk4Ljc1Ni0yMDQuMjgyIDU2LjUxMyAwIDEwNS4wODYgNC4yMDggMTE5LjI0NCA2LjA4OVYyOTlsLTgxLjYxNi4wMzdjLTYzLjk5MyAwLTc2LjM4NCAzMC40OTItNzYuMzg0IDc1LjIzNlY0NzNoMTUzLjQ4N2wtMTkuOTg2IDE1NUg3MDd2Mzk2aDI2MC40ODRjMzEuMjEzIDAgNTYuNTE2LTI1LjMwMyA1Ni41MTYtNTYuNTE2VjU2LjUxNUMxMDI0IDI1LjMwMyA5OTguNjk3IDAgOTY3LjQ4NCAwIiBmaWxsPSIjRkZGRkZFIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48L3N2Zz4=)}.ck-media__wrapper[data-oembed-url*="facebook.com"] .ck-media__placeholder .ck-media__placeholder__url__text{color:#cdf}.ck-media__wrapper[data-oembed-url*="facebook.com"] .ck-media__placeholder .ck-media__placeholder__url__text:hover{color:#fff}.ck-media__wrapper[data-oembed-url*="instagram.com"] .ck-media__placeholder{background:linear-gradient(-135deg,#1400c8,#b900b4,#f50000)}.ck-media__wrapper[data-oembed-url*="instagram.com"] .ck-media__placeholder .ck-media__placeholder__icon{background-image:url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTA0IiBoZWlnaHQ9IjUwNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+PGRlZnM+PHBhdGggaWQ9ImEiIGQ9Ik0wIC4xNTloNTAzLjg0MVY1MDMuOTRIMHoiLz48L2RlZnM+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48bWFzayBpZD0iYiIgZmlsbD0iI2ZmZiI+PHVzZSB4bGluazpocmVmPSIjYSIvPjwvbWFzaz48cGF0aCBkPSJNMjUxLjkyMS4xNTljLTY4LjQxOCAwLTc2Ljk5Ny4yOS0xMDMuODY3IDEuNTE2LTI2LjgxNCAxLjIyMy00NS4xMjcgNS40ODItNjEuMTUxIDExLjcxLTE2LjU2NiA2LjQzNy0zMC42MTUgMTUuMDUxLTQ0LjYyMSAyOS4wNTYtMTQuMDA1IDE0LjAwNi0yMi42MTkgMjguMDU1LTI5LjA1NiA0NC42MjEtNi4yMjggMTYuMDI0LTEwLjQ4NyAzNC4zMzctMTEuNzEgNjEuMTUxQy4yOSAxNzUuMDgzIDAgMTgzLjY2MiAwIDI1Mi4wOGMwIDY4LjQxNy4yOSA3Ni45OTYgMS41MTYgMTAzLjg2NiAxLjIyMyAyNi44MTQgNS40ODIgNDUuMTI3IDExLjcxIDYxLjE1MSA2LjQzNyAxNi41NjYgMTUuMDUxIDMwLjYxNSAyOS4wNTYgNDQuNjIxIDE0LjAwNiAxNC4wMDUgMjguMDU1IDIyLjYxOSA0NC42MjEgMjkuMDU3IDE2LjAyNCA2LjIyNyAzNC4zMzcgMTAuNDg2IDYxLjE1MSAxMS43MDkgMjYuODcgMS4yMjYgMzUuNDQ5IDEuNTE2IDEwMy44NjcgMS41MTYgNjguNDE3IDAgNzYuOTk2LS4yOSAxMDMuODY2LTEuNTE2IDI2LjgxNC0xLjIyMyA0NS4xMjctNS40ODIgNjEuMTUxLTExLjcwOSAxNi41NjYtNi40MzggMzAuNjE1LTE1LjA1MiA0NC42MjEtMjkuMDU3IDE0LjAwNS0xNC4wMDYgMjIuNjE5LTI4LjA1NSAyOS4wNTctNDQuNjIxIDYuMjI3LTE2LjAyNCAxMC40ODYtMzQuMzM3IDExLjcwOS02MS4xNTEgMS4yMjYtMjYuODcgMS41MTYtMzUuNDQ5IDEuNTE2LTEwMy44NjYgMC02OC40MTgtLjI5LTc2Ljk5Ny0xLjUxNi0xMDMuODY3LTEuMjIzLTI2LjgxNC01LjQ4Mi00NS4xMjctMTEuNzA5LTYxLjE1MS02LjQzOC0xNi41NjYtMTUuMDUyLTMwLjYxNS0yOS4wNTctNDQuNjIxLTE0LjAwNi0xNC4wMDUtMjguMDU1LTIyLjYxOS00NC42MjEtMjkuMDU2LTE2LjAyNC02LjIyOC0zNC4zMzctMTAuNDg3LTYxLjE1MS0xMS43MUMzMjguOTE3LjQ0OSAzMjAuMzM4LjE1OSAyNTEuOTIxLjE1OXptMCA0NS4zOTFjNjcuMjY1IDAgNzUuMjMzLjI1NyAxMDEuNzk3IDEuNDY5IDI0LjU2MiAxLjEyIDM3LjkwMSA1LjIyNCA0Ni43NzggOC42NzQgMTEuNzU5IDQuNTcgMjAuMTUxIDEwLjAyOSAyOC45NjYgMTguODQ1IDguODE2IDguODE1IDE0LjI3NSAxNy4yMDcgMTguODQ1IDI4Ljk2NiAzLjQ1IDguODc3IDcuNTU0IDIyLjIxNiA4LjY3NCA0Ni43NzggMS4yMTIgMjYuNTY0IDEuNDY5IDM0LjUzMiAxLjQ2OSAxMDEuNzk4IDAgNjcuMjY1LS4yNTcgNzUuMjMzLTEuNDY5IDEwMS43OTctMS4xMiAyNC41NjItNS4yMjQgMzcuOTAxLTguNjc0IDQ2Ljc3OC00LjU3IDExLjc1OS0xMC4wMjkgMjAuMTUxLTE4Ljg0NSAyOC45NjYtOC44MTUgOC44MTYtMTcuMjA3IDE0LjI3NS0yOC45NjYgMTguODQ1LTguODc3IDMuNDUtMjIuMjE2IDcuNTU0LTQ2Ljc3OCA4LjY3NC0yNi41NiAxLjIxMi0zNC41MjcgMS40NjktMTAxLjc5NyAxLjQ2OS02Ny4yNzEgMC03NS4yMzctLjI1Ny0xMDEuNzk4LTEuNDY5LTI0LjU2Mi0xLjEyLTM3LjkwMS01LjIyNC00Ni43NzgtOC42NzQtMTEuNzU5LTQuNTctMjAuMTUxLTEwLjAyOS0yOC45NjYtMTguODQ1LTguODE1LTguODE1LTE0LjI3NS0xNy4yMDctMTguODQ1LTI4Ljk2Ni0zLjQ1LTguODc3LTcuNTU0LTIyLjIxNi04LjY3NC00Ni43NzgtMS4yMTItMjYuNTY0LTEuNDY5LTM0LjUzMi0xLjQ2OS0xMDEuNzk3IDAtNjcuMjY2LjI1Ny03NS4yMzQgMS40NjktMTAxLjc5OCAxLjEyLTI0LjU2MiA1LjIyNC0zNy45MDEgOC42NzQtNDYuNzc4IDQuNTctMTEuNzU5IDEwLjAyOS0yMC4xNTEgMTguODQ1LTI4Ljk2NiA4LjgxNS04LjgxNiAxNy4yMDctMTQuMjc1IDI4Ljk2Ni0xOC44NDUgOC44NzctMy40NSAyMi4yMTYtNy41NTQgNDYuNzc4LTguNjc0IDI2LjU2NC0xLjIxMiAzNC41MzItMS40NjkgMTAxLjc5OC0xLjQ2OXoiIGZpbGw9IiNGRkYiIG1hc2s9InVybCgjYikiLz48cGF0aCBkPSJNMjUxLjkyMSAzMzYuMDUzYy00Ni4zNzggMC04My45NzQtMzcuNTk2LTgzLjk3NC04My45NzMgMC00Ni4zNzggMzcuNTk2LTgzLjk3NCA4My45NzQtODMuOTc0IDQ2LjM3NyAwIDgzLjk3MyAzNy41OTYgODMuOTczIDgzLjk3NCAwIDQ2LjM3Ny0zNy41OTYgODMuOTczLTgzLjk3MyA4My45NzN6bTAtMjEzLjMzOGMtNzEuNDQ3IDAtMTI5LjM2NSA1Ny45MTgtMTI5LjM2NSAxMjkuMzY1IDAgNzEuNDQ2IDU3LjkxOCAxMjkuMzY0IDEyOS4zNjUgMTI5LjM2NCA3MS40NDYgMCAxMjkuMzY0LTU3LjkxOCAxMjkuMzY0LTEyOS4zNjQgMC03MS40NDctNTcuOTE4LTEyOS4zNjUtMTI5LjM2NC0xMjkuMzY1ek00MTYuNjI3IDExNy42MDRjMCAxNi42OTYtMTMuNTM1IDMwLjIzLTMwLjIzMSAzMC4yMy0xNi42OTUgMC0zMC4yMy0xMy41MzQtMzAuMjMtMzAuMjMgMC0xNi42OTYgMTMuNTM1LTMwLjIzMSAzMC4yMy0zMC4yMzEgMTYuNjk2IDAgMzAuMjMxIDEzLjUzNSAzMC4yMzEgMzAuMjMxIiBmaWxsPSIjRkZGIi8+PC9nPjwvc3ZnPg==)}.ck-media__wrapper[data-oembed-url*="instagram.com"] .ck-media__placeholder .ck-media__placeholder__url__text{color:#ffe0fe}.ck-media__wrapper[data-oembed-url*="instagram.com"] .ck-media__placeholder .ck-media__placeholder__url__text:hover{color:#fff}';},function(t,e,n){var i=n(121);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck.ck-media-form{display:flex;align-items:flex-start;flex-direction:row;flex-wrap:nowrap}.ck.ck-media-form .ck-labeled-input{display:inline-block}.ck.ck-media-form .ck-label{display:none}@media screen and (max-width:600px){.ck.ck-media-form{flex-wrap:wrap}.ck.ck-media-form .ck-labeled-input{flex-basis:100%}.ck.ck-media-form .ck-button{flex-basis:50%}}.ck.ck-media-form{padding:var(--ck-spacing-standard)}.ck.ck-media-form:focus{outline:none}.ck.ck-media-form>:not(:first-child){margin-left:var(--ck-spacing-standard)}@media screen and (max-width:600px){.ck.ck-media-form{padding:0;width:calc(0.8*var(--ck-input-text-width))}.ck.ck-media-form .ck-labeled-input{margin:var(--ck-spacing-standard) var(--ck-spacing-standard) 0}.ck.ck-media-form .ck-labeled-input .ck-input-text{min-width:0;width:100%}.ck.ck-media-form .ck-labeled-input .ck-labeled-input__error{white-space:normal}.ck.ck-media-form .ck-button{padding:var(--ck-spacing-standard);margin-top:var(--ck-spacing-standard);margin-left:0;border-radius:0;border:0;border-top:1px solid var(--ck-color-base-border)}.ck.ck-media-form .ck-button:first-of-type{border-right:1px solid var(--ck-color-base-border)}}";},function(t,e,n){var i=n(123);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck-content .media{clear:both;margin:1em 0}";},function(t,e,n){var i=n(125);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=":root{--ck-color-table-focused-cell-background:#f5fafe}.ck-widget.table td.ck-editor__nested-editable.ck-editor__nested-editable_focused,.ck-widget.table th.ck-editor__nested-editable.ck-editor__nested-editable_focused{background:var(--ck-color-table-focused-cell-background);border-style:none;outline:1px solid var(--ck-color-focus-border);outline-offset:-1px}";},function(t,e,n){var i=n(127);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=":root{--ck-insert-table-dropdown-padding:10px;--ck-insert-table-dropdown-box-height:11px;--ck-insert-table-dropdown-box-width:12px;--ck-insert-table-dropdown-box-margin:1px;--ck-insert-table-dropdown-box-border-color:#bfbfbf;--ck-insert-table-dropdown-box-border-active-color:#53a0e4;--ck-insert-table-dropdown-box-active-background:#c7e5ff}.ck .ck-insert-table-dropdown__grid{display:flex;flex-direction:row;flex-wrap:wrap;width:calc(var(--ck-insert-table-dropdown-box-width)*10 + var(--ck-insert-table-dropdown-box-margin)*20 + var(--ck-insert-table-dropdown-padding)*2);padding:var(--ck-insert-table-dropdown-padding) var(--ck-insert-table-dropdown-padding) 0}.ck .ck-insert-table-dropdown__label{text-align:center}.ck .ck-insert-table-dropdown-grid-box{width:var(--ck-insert-table-dropdown-box-width);height:var(--ck-insert-table-dropdown-box-height);margin:var(--ck-insert-table-dropdown-box-margin);border:1px solid var(--ck-insert-table-dropdown-box-border-color);border-radius:1px}.ck .ck-insert-table-dropdown-grid-box.ck-on{border-color:var(--ck-insert-table-dropdown-box-border-active-color);background:var(--ck-insert-table-dropdown-box-active-background)}";},function(t,e,n){var i=n(129);"string"==typeof i&&(i=[[t.i,i,""]]);var o={singleton:!0,hmr:!0,transform:void 0,insertInto:void 0};n(2)(i,o);i.locals&&(t.exports=i.locals);},function(t,e){t.exports=".ck-content .table{margin:1em auto;display:table}.ck-content .table table{border-collapse:collapse;border-spacing:0;border:1px double #b3b3b3}.ck-content .table table td,.ck-content .table table th{min-width:2em;padding:.4em;border-color:#d9d9d9}.ck-content .table table th{font-weight:700;background:#fafafa}";},function(t,e,n){n.r(e);var i=n(4),o=i.a.Symbol,r=Object.prototype,s=r.hasOwnProperty,a=r.toString,c=o?o.toStringTag:void 0;var l=function(t){var e=s.call(t,c),n=t[c];try{t[c]=void 0;}catch(t){}var o=a.call(t);return e?t[c]=n:delete t[c],o},d=Object.prototype.toString;var u=function(t){return d.call(t)},h="[object Null]",f="[object Undefined]",m=o?o.toStringTag:void 0;var g=function(t){return null==t?void 0===t?f:h:m&&m in Object(t)?l(t):u(t)};var p=function(t,e){return function(n){return t(e(n))}},b=p(Object.getPrototypeOf,Object);var w=function(t){return null!=t&&"object"==typeof t},_="[object Object]",k=Function.prototype,v=Object.prototype,y=k.toString,x=v.hasOwnProperty,A=y.call(Object);var C=function(t){if(!w(t)||g(t)!=_)return !1;var e=b(t);if(null===e)return !0;var n=x.call(e,"constructor")&&e.constructor;return "function"==typeof n&&n instanceof n&&y.call(n)==A};class T{constructor(t,e){this._config={},e&&this.define(e),t&&this._setObjectToTarget(this._config,t);}set(t,e){this._setToTarget(this._config,t,e);}define(t,e){this._setToTarget(this._config,t,e,!0);}get(t){return this._getFromSource(this._config,t)}_setToTarget(t,e,n,i=!1){if(C(e))return void this._setObjectToTarget(t,e,i);const o=e.split(".");e=o.pop();for(const e of o)C(t[e])||(t[e]={}),t=t[e];if(C(n))return C(t[e])||(t[e]={}),t=t[e],void this._setObjectToTarget(t,n,i);i&&void 0!==t[e]||(t[e]=n);}_getFromSource(t,e){const n=e.split(".");e=n.pop();for(const e of n){if(!C(t[e])){t=null;break}t=t[e];}return t?t[e]:void 0}_setObjectToTarget(t,e,n){Object.keys(e).forEach(i=>{this._setToTarget(t,i,e[i],n);});}}var P=n(0);var M=function(){return function t(){t.called=!0;}};class S{constructor(t,e){this.source=t,this.name=e,this.path=[],this.stop=M(),this.off=M();}}function I(){let t="e";for(let e=0;e<8;e++)t+=Math.floor(65536*(1+Math.random())).toString(16).substring(1);return t}var E={get(t){return "number"!=typeof t?this[t]||this.normal:t},highest:1e5,high:1e3,normal:0,low:-1e3,lowest:-1e5};const N=Symbol("listeningTo"),O=Symbol("emitterId");var R={on(t,e,n={}){this.listenTo(this,t,e,n);},once(t,e,n){this.listenTo(this,t,function(t,...n){t.off(),e.call(this,t,...n);},n);},off(t,e){this.stopListening(this,t,e);},listenTo(t,e,n,i={}){let o,r;this[N]||(this[N]={});const s=this[N];L(t)||D(t);const a=L(t);(o=s[a])||(o=s[a]={emitter:t,callbacks:{}}),(r=o.callbacks[e])||(r=o.callbacks[e]=[]),r.push(n),function(t,e){const n=j(t);if(n[e])return;let i=e,o=null;const r=[];for(;""!==i&&!n[i];)n[i]={callbacks:[],childEvents:[]},r.push(n[i]),o&&n[i].childEvents.push(o),o=i,i=i.substr(0,i.lastIndexOf(":"));if(""!==i){for(const t of r)t.callbacks=n[i].callbacks.slice();n[i].childEvents.push(o);}}(t,e);const c=V(t,e),l=E.get(i.priority),d={callback:n,priority:l};for(const t of c){let e=!1;for(let n=0;n<t.length;n++)if(t[n].priority<l){t.splice(n,0,d),e=!0;break}e||t.push(d);}},stopListening(t,e,n){const i=this[N];let o=t&&L(t);const r=i&&o&&i[o],s=r&&e&&r.callbacks[e];if(!(!i||t&&!r||e&&!s))if(n)B(t,e,n);else if(s){for(;n=s.pop();)B(t,e,n);delete r.callbacks[e];}else if(r){for(e in r.callbacks)this.stopListening(t,e);delete i[o];}else{for(o in i)this.stopListening(i[o].emitter);delete this[N];}},fire(t,...e){const n=t instanceof S?t:new S(this,t),i=n.name;let o=function t(e,n){let i;if(!e._events||!(i=e._events[n])||!i.callbacks.length)return n.indexOf(":")>-1?t(e,n.substr(0,n.lastIndexOf(":"))):null;return i.callbacks}(this,i);if(n.path.push(this),o){const t=[n,...e];o=Array.from(o);for(let e=0;e<o.length&&(o[e].callback.apply(this,t),n.off.called&&(delete n.off.called,B(this,i,o[e].callback)),!n.stop.called);e++);}if(this._delegations){const t=this._delegations.get(i),o=this._delegations.get("*");t&&z(t,n,e),o&&z(o,n,e);}return n.return},delegate(...t){return {to:(e,n)=>{this._delegations||(this._delegations=new Map);for(const i of t){const t=this._delegations.get(i);t?t.set(e,n):this._delegations.set(i,new Map([[e,n]]));}}}},stopDelegating(t,e){if(this._delegations)if(t)if(e){const n=this._delegations.get(t);n&&n.delete(e);}else this._delegations.delete(t);else this._delegations.clear();}};function D(t,e){t[O]||(t[O]=e||I());}function L(t){return t[O]}function j(t){return t._events||Object.defineProperty(t,"_events",{value:{}}),t._events}function V(t,e){const n=j(t)[e];if(!n)return [];let i=[n.callbacks];for(let e=0;e<n.childEvents.length;e++){const o=V(t,n.childEvents[e]);i=i.concat(o);}return i}function z(t,e,n){for(let[i,o]of t){o?"function"==typeof o&&(o=o(e.name)):o=e.name;const t=new S(e.source,o);t.path=[...e.path],i.fire(t,...n);}}function B(t,e,n){const i=V(t,e);for(const t of i)for(let e=0;e<t.length;e++)t[e].callback==n&&(t.splice(e,1),e--);}function F(t,...e){e.forEach(e=>{Object.getOwnPropertyNames(e).concat(Object.getOwnPropertySymbols(e)).forEach(n=>{if(n in t.prototype)return;const i=Object.getOwnPropertyDescriptor(e,n);i.enumerable=!1,Object.defineProperty(t.prototype,n,i);});});}function U(t,e){const n=Math.min(t.length,e.length);for(let i=0;i<n;i++)if(t[i]!=e[i])return i;return t.length==e.length?"same":t.length<e.length?"prefix":"extension"}var H=function(){this.__data__=[],this.size=0;};var q=function(t,e){return t===e||t!=t&&e!=e};var W=function(t,e){for(var n=t.length;n--;)if(q(t[n][0],e))return n;return -1},Y=Array.prototype.splice;var $=function(t){var e=this.__data__,n=W(e,t);return !(n<0||(n==e.length-1?e.pop():Y.call(e,n,1),--this.size,0))};var G=function(t){var e=this.__data__,n=W(e,t);return n<0?void 0:e[n][1]};var Q=function(t){return W(this.__data__,t)>-1};var K=function(t,e){var n=this.__data__,i=W(n,t);return i<0?(++this.size,n.push([t,e])):n[i][1]=e,this};function J(t){var e=-1,n=null==t?0:t.length;for(this.clear();++e<n;){var i=t[e];this.set(i[0],i[1]);}}J.prototype.clear=H,J.prototype.delete=$,J.prototype.get=G,J.prototype.has=Q,J.prototype.set=K;var Z=J;var X=function(){this.__data__=new Z,this.size=0;};var tt=function(t){var e=this.__data__,n=e.delete(t);return this.size=e.size,n};var et=function(t){return this.__data__.get(t)};var nt=function(t){return this.__data__.has(t)};var it=function(t){var e=typeof t;return null!=t&&("object"==e||"function"==e)},ot="[object AsyncFunction]",rt="[object Function]",st="[object GeneratorFunction]",at="[object Proxy]";var ct=function(t){if(!it(t))return !1;var e=g(t);return e==rt||e==st||e==ot||e==at},lt=i.a["__core-js_shared__"],dt=function(){var t=/[^.]+$/.exec(lt&&lt.keys&&lt.keys.IE_PROTO||"");return t?"Symbol(src)_1."+t:""}();var ut=function(t){return !!dt&&dt in t},ht=Function.prototype.toString;var ft=function(t){if(null!=t){try{return ht.call(t)}catch(t){}try{return t+""}catch(t){}}return ""},mt=/^\[object .+?Constructor\]$/,gt=Function.prototype,pt=Object.prototype,bt=gt.toString,wt=pt.hasOwnProperty,_t=RegExp("^"+bt.call(wt).replace(/[\\^$.*+?()[\]{}|]/g,"\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g,"$1.*?")+"$");var kt=function(t){return !(!it(t)||ut(t))&&(ct(t)?_t:mt).test(ft(t))};var vt=function(t,e){return null==t?void 0:t[e]};var yt=function(t,e){var n=vt(t,e);return kt(n)?n:void 0},xt=yt(i.a,"Map"),At=yt(Object,"create");var Ct=function(){this.__data__=At?At(null):{},this.size=0;};var Tt=function(t){var e=this.has(t)&&delete this.__data__[t];return this.size-=e?1:0,e},Pt="__lodash_hash_undefined__",Mt=Object.prototype.hasOwnProperty;var St=function(t){var e=this.__data__;if(At){var n=e[t];return n===Pt?void 0:n}return Mt.call(e,t)?e[t]:void 0},It=Object.prototype.hasOwnProperty;var Et=function(t){var e=this.__data__;return At?void 0!==e[t]:It.call(e,t)},Nt="__lodash_hash_undefined__";var Ot=function(t,e){var n=this.__data__;return this.size+=this.has(t)?0:1,n[t]=At&&void 0===e?Nt:e,this};function Rt(t){var e=-1,n=null==t?0:t.length;for(this.clear();++e<n;){var i=t[e];this.set(i[0],i[1]);}}Rt.prototype.clear=Ct,Rt.prototype.delete=Tt,Rt.prototype.get=St,Rt.prototype.has=Et,Rt.prototype.set=Ot;var Dt=Rt;var Lt=function(){this.size=0,this.__data__={hash:new Dt,map:new(xt||Z),string:new Dt};};var jt=function(t){var e=typeof t;return "string"==e||"number"==e||"symbol"==e||"boolean"==e?"__proto__"!==t:null===t};var Vt=function(t,e){var n=t.__data__;return jt(e)?n["string"==typeof e?"string":"hash"]:n.map};var zt=function(t){var e=Vt(this,t).delete(t);return this.size-=e?1:0,e};var Bt=function(t){return Vt(this,t).get(t)};var Ft=function(t){return Vt(this,t).has(t)};var Ut=function(t,e){var n=Vt(this,t),i=n.size;return n.set(t,e),this.size+=n.size==i?0:1,this};function Ht(t){var e=-1,n=null==t?0:t.length;for(this.clear();++e<n;){var i=t[e];this.set(i[0],i[1]);}}Ht.prototype.clear=Lt,Ht.prototype.delete=zt,Ht.prototype.get=Bt,Ht.prototype.has=Ft,Ht.prototype.set=Ut;var qt=Ht,Wt=200;var Yt=function(t,e){var n=this.__data__;if(n instanceof Z){var i=n.__data__;if(!xt||i.length<Wt-1)return i.push([t,e]),this.size=++n.size,this;n=this.__data__=new qt(i);}return n.set(t,e),this.size=n.size,this};function $t(t){var e=this.__data__=new Z(t);this.size=e.size;}$t.prototype.clear=X,$t.prototype.delete=tt,$t.prototype.get=et,$t.prototype.has=nt,$t.prototype.set=Yt;var Gt=$t;var Qt=function(t,e){for(var n=-1,i=null==t?0:t.length;++n<i&&!1!==e(t[n],n,t););return t},Kt=function(){try{var t=yt(Object,"defineProperty");return t({},"",{}),t}catch(t){}}();var Jt=function(t,e,n){"__proto__"==e&&Kt?Kt(t,e,{configurable:!0,enumerable:!0,value:n,writable:!0}):t[e]=n;},Zt=Object.prototype.hasOwnProperty;var Xt=function(t,e,n){var i=t[e];Zt.call(t,e)&&q(i,n)&&(void 0!==n||e in t)||Jt(t,e,n);};var te=function(t,e,n,i){var o=!n;n||(n={});for(var r=-1,s=e.length;++r<s;){var a=e[r],c=i?i(n[a],t[a],a,n,t):void 0;void 0===c&&(c=t[a]),o?Jt(n,a,c):Xt(n,a,c);}return n};var ee=function(t,e){for(var n=-1,i=Array(t);++n<t;)i[n]=e(n);return i},ne="[object Arguments]";var ie=function(t){return w(t)&&g(t)==ne},oe=Object.prototype,re=oe.hasOwnProperty,se=oe.propertyIsEnumerable,ae=ie(function(){return arguments}())?ie:function(t){return w(t)&&re.call(t,"callee")&&!se.call(t,"callee")},ce=Array.isArray,le=n(6),de=9007199254740991,ue=/^(?:0|[1-9]\d*)$/;var he=function(t,e){var n=typeof t;return !!(e=null==e?de:e)&&("number"==n||"symbol"!=n&&ue.test(t))&&t>-1&&t%1==0&&t<e},fe=9007199254740991;var me=function(t){return "number"==typeof t&&t>-1&&t%1==0&&t<=fe},ge={};ge["[object Float32Array]"]=ge["[object Float64Array]"]=ge["[object Int8Array]"]=ge["[object Int16Array]"]=ge["[object Int32Array]"]=ge["[object Uint8Array]"]=ge["[object Uint8ClampedArray]"]=ge["[object Uint16Array]"]=ge["[object Uint32Array]"]=!0,ge["[object Arguments]"]=ge["[object Array]"]=ge["[object ArrayBuffer]"]=ge["[object Boolean]"]=ge["[object DataView]"]=ge["[object Date]"]=ge["[object Error]"]=ge["[object Function]"]=ge["[object Map]"]=ge["[object Number]"]=ge["[object Object]"]=ge["[object RegExp]"]=ge["[object Set]"]=ge["[object String]"]=ge["[object WeakMap]"]=!1;var pe=function(t){return w(t)&&me(t.length)&&!!ge[g(t)]};var be=function(t){return function(e){return t(e)}},we=n(5),_e=we.a&&we.a.isTypedArray,ke=_e?be(_e):pe,ve=Object.prototype.hasOwnProperty;var ye=function(t,e){var n=ce(t),i=!n&&ae(t),o=!n&&!i&&Object(le.a)(t),r=!n&&!i&&!o&&ke(t),s=n||i||o||r,a=s?ee(t.length,String):[],c=a.length;for(var l in t)!e&&!ve.call(t,l)||s&&("length"==l||o&&("offset"==l||"parent"==l)||r&&("buffer"==l||"byteLength"==l||"byteOffset"==l)||he(l,c))||a.push(l);return a},xe=Object.prototype;var Ae=function(t){var e=t&&t.constructor;return t===("function"==typeof e&&e.prototype||xe)},Ce=p(Object.keys,Object),Te=Object.prototype.hasOwnProperty;var Pe=function(t){if(!Ae(t))return Ce(t);var e=[];for(var n in Object(t))Te.call(t,n)&&"constructor"!=n&&e.push(n);return e};var Me=function(t){return null!=t&&me(t.length)&&!ct(t)};var Se=function(t){return Me(t)?ye(t):Pe(t)};var Ie=function(t,e){return t&&te(e,Se(e),t)};var Ee=function(t){var e=[];if(null!=t)for(var n in Object(t))e.push(n);return e},Ne=Object.prototype.hasOwnProperty;var Oe=function(t){if(!it(t))return Ee(t);var e=Ae(t),n=[];for(var i in t)("constructor"!=i||!e&&Ne.call(t,i))&&n.push(i);return n};var Re=function(t){return Me(t)?ye(t,!0):Oe(t)};var De=function(t,e){return t&&te(e,Re(e),t)},Le=n(21);var je=function(t,e){var n=-1,i=t.length;for(e||(e=Array(i));++n<i;)e[n]=t[n];return e};var Ve=function(t,e){for(var n=-1,i=null==t?0:t.length,o=0,r=[];++n<i;){var s=t[n];e(s,n,t)&&(r[o++]=s);}return r};var ze=function(){return []},Be=Object.prototype.propertyIsEnumerable,Fe=Object.getOwnPropertySymbols,Ue=Fe?function(t){return null==t?[]:(t=Object(t),Ve(Fe(t),function(e){return Be.call(t,e)}))}:ze;var He=function(t,e){return te(t,Ue(t),e)};var qe=function(t,e){for(var n=-1,i=e.length,o=t.length;++n<i;)t[o+n]=e[n];return t},We=Object.getOwnPropertySymbols?function(t){for(var e=[];t;)qe(e,Ue(t)),t=b(t);return e}:ze;var Ye=function(t,e){return te(t,We(t),e)};var $e=function(t,e,n){var i=e(t);return ce(t)?i:qe(i,n(t))};var Ge=function(t){return $e(t,Se,Ue)};var Qe=function(t){return $e(t,Re,We)},Ke=yt(i.a,"DataView"),Je=yt(i.a,"Promise"),Ze=yt(i.a,"Set"),Xe=yt(i.a,"WeakMap"),tn=ft(Ke),en=ft(xt),nn=ft(Je),on=ft(Ze),rn=ft(Xe),sn=g;(Ke&&"[object DataView]"!=sn(new Ke(new ArrayBuffer(1)))||xt&&"[object Map]"!=sn(new xt)||Je&&"[object Promise]"!=sn(Je.resolve())||Ze&&"[object Set]"!=sn(new Ze)||Xe&&"[object WeakMap]"!=sn(new Xe))&&(sn=function(t){var e=g(t),n="[object Object]"==e?t.constructor:void 0,i=n?ft(n):"";if(i)switch(i){case tn:return "[object DataView]";case en:return "[object Map]";case nn:return "[object Promise]";case on:return "[object Set]";case rn:return "[object WeakMap]"}return e});var an=sn,cn=Object.prototype.hasOwnProperty;var ln=function(t){var e=t.length,n=new t.constructor(e);return e&&"string"==typeof t[0]&&cn.call(t,"index")&&(n.index=t.index,n.input=t.input),n},dn=i.a.Uint8Array;var un=function(t){var e=new t.constructor(t.byteLength);return new dn(e).set(new dn(t)),e};var hn=function(t,e){var n=e?un(t.buffer):t.buffer;return new t.constructor(n,t.byteOffset,t.byteLength)},fn=/\w*$/;var mn=function(t){var e=new t.constructor(t.source,fn.exec(t));return e.lastIndex=t.lastIndex,e},gn=o?o.prototype:void 0,pn=gn?gn.valueOf:void 0;var bn=function(t){return pn?Object(pn.call(t)):{}};var wn=function(t,e){var n=e?un(t.buffer):t.buffer;return new t.constructor(n,t.byteOffset,t.length)},_n="[object Boolean]",kn="[object Date]",vn="[object Map]",yn="[object Number]",xn="[object RegExp]",An="[object Set]",Cn="[object String]",Tn="[object Symbol]",Pn="[object ArrayBuffer]",Mn="[object DataView]",Sn="[object Float32Array]",In="[object Float64Array]",En="[object Int8Array]",Nn="[object Int16Array]",On="[object Int32Array]",Rn="[object Uint8Array]",Dn="[object Uint8ClampedArray]",Ln="[object Uint16Array]",jn="[object Uint32Array]";var Vn=function(t,e,n){var i=t.constructor;switch(e){case Pn:return un(t);case _n:case kn:return new i(+t);case Mn:return hn(t,n);case Sn:case In:case En:case Nn:case On:case Rn:case Dn:case Ln:case jn:return wn(t,n);case vn:return new i;case yn:case Cn:return new i(t);case xn:return mn(t);case An:return new i;case Tn:return bn(t)}},zn=Object.create,Bn=function(){function t(){}return function(e){if(!it(e))return {};if(zn)return zn(e);t.prototype=e;var n=new t;return t.prototype=void 0,n}}();var Fn=function(t){return "function"!=typeof t.constructor||Ae(t)?{}:Bn(b(t))},Un="[object Map]";var Hn=function(t){return w(t)&&an(t)==Un},qn=we.a&&we.a.isMap,Wn=qn?be(qn):Hn,Yn="[object Set]";var $n=function(t){return w(t)&&an(t)==Yn},Gn=we.a&&we.a.isSet,Qn=Gn?be(Gn):$n,Kn=1,Jn=2,Zn=4,Xn="[object Arguments]",ti="[object Function]",ei="[object GeneratorFunction]",ni="[object Object]",ii={};ii[Xn]=ii["[object Array]"]=ii["[object ArrayBuffer]"]=ii["[object DataView]"]=ii["[object Boolean]"]=ii["[object Date]"]=ii["[object Float32Array]"]=ii["[object Float64Array]"]=ii["[object Int8Array]"]=ii["[object Int16Array]"]=ii["[object Int32Array]"]=ii["[object Map]"]=ii["[object Number]"]=ii[ni]=ii["[object RegExp]"]=ii["[object Set]"]=ii["[object String]"]=ii["[object Symbol]"]=ii["[object Uint8Array]"]=ii["[object Uint8ClampedArray]"]=ii["[object Uint16Array]"]=ii["[object Uint32Array]"]=!0,ii["[object Error]"]=ii[ti]=ii["[object WeakMap]"]=!1;var oi=function t(e,n,i,o,r,s){var a,c=n&Kn,l=n&Jn,d=n&Zn;if(i&&(a=r?i(e,o,r,s):i(e)),void 0!==a)return a;if(!it(e))return e;var u=ce(e);if(u){if(a=ln(e),!c)return je(e,a)}else{var h=an(e),f=h==ti||h==ei;if(Object(le.a)(e))return Object(Le.a)(e,c);if(h==ni||h==Xn||f&&!r){if(a=l||f?{}:Fn(e),!c)return l?Ye(e,De(a,e)):He(e,Ie(a,e))}else{if(!ii[h])return r?e:{};a=Vn(e,h,c);}}s||(s=new Gt);var m=s.get(e);if(m)return m;if(s.set(e,a),Qn(e))return e.forEach(function(o){a.add(t(o,n,i,o,e,s));}),a;if(Wn(e))return e.forEach(function(o,r){a.set(r,t(o,n,i,r,e,s));}),a;var g=d?l?Qe:Ge:l?keysIn:Se,p=u?void 0:g(e);return Qt(p||e,function(o,r){p&&(o=e[r=o]),Xt(a,r,t(o,n,i,r,e,s));}),a},ri=4;var si=function(t){return oi(t,ri)};class ai{constructor(){this.parent=null;}get index(){let t;if(!this.parent)return null;if(-1==(t=this.parent.getChildIndex(this)))throw new P.b("view-node-not-found-in-parent: The node's parent does not contain this node.");return t}get nextSibling(){const t=this.index;return null!==t&&this.parent.getChild(t+1)||null}get previousSibling(){const t=this.index;return null!==t&&this.parent.getChild(t-1)||null}get root(){let t=this;for(;t.parent;)t=t.parent;return t}get document(){return this.parent instanceof ai?this.parent.document:null}getPath(){const t=[];let e=this;for(;e.parent;)t.unshift(e.index),e=e.parent;return t}getAncestors(t={includeSelf:!1,parentFirst:!1}){const e=[];let n=t.includeSelf?this:this.parent;for(;n;)e[t.parentFirst?"push":"unshift"](n),n=n.parent;return e}getCommonAncestor(t,e={}){const n=this.getAncestors(e),i=t.getAncestors(e);let o=0;for(;n[o]==i[o]&&n[o];)o++;return 0===o?null:n[o-1]}isBefore(t){if(this==t)return !1;if(this.root!==t.root)return !1;const e=this.getPath(),n=t.getPath(),i=U(e,n);switch(i){case"prefix":return !0;case"extension":return !1;default:return e[i]<n[i]}}isAfter(t){return this!=t&&(this.root===t.root&&!this.isBefore(t))}_remove(){this.parent._removeChildren(this.index);}_fireChange(t,e){this.fire("change:"+t,e),this.parent&&this.parent._fireChange(t,e);}toJSON(){const t=si(this);return delete t.parent,t}is(t){return "node"==t}}F(ai,R);class ci extends ai{constructor(t){super(),this._textData=t;}is(t){return "text"==t||super.is(t)}get data(){return this._textData}get _data(){return this.data}set _data(t){this._fireChange("text",this),this._textData=t;}isSimilar(t){return t instanceof ci&&(this===t||this.data===t.data)}_clone(){return new ci(this.data)}}class li{constructor(t,e,n){if(this.textNode=t,e<0||e>t.data.length)throw new P.b("view-textproxy-wrong-offsetintext: Given offsetInText value is incorrect.");if(n<0||e+n>t.data.length)throw new P.b("view-textproxy-wrong-length: Given length value is incorrect.");this.data=t.data.substring(e,e+n),this.offsetInText=e;}get offsetSize(){return this.data.length}get isPartial(){return this.data.length!==this.textNode.data.length}get parent(){return this.textNode.parent}get root(){return this.textNode.root}get document(){return this.textNode.document}is(t){return "textProxy"==t}getAncestors(t={includeSelf:!1,parentFirst:!1}){const e=[];let n=t.includeSelf?this.textNode:this.parent;for(;null!==n;)e[t.parentFirst?"push":"unshift"](n),n=n.parent;return e}}function di(t){const e=new Map;for(const n in t)e.set(n,t[n]);return e}function ui(t){return !(!t||!t[Symbol.iterator])}class hi{constructor(...t){this._patterns=[],this.add(...t);}add(...t){for(let e of t)("string"==typeof e||e instanceof RegExp)&&(e={name:e}),e.classes&&("string"==typeof e.classes||e.classes instanceof RegExp)&&(e.classes=[e.classes]),this._patterns.push(e);}match(...t){for(const e of t)for(const t of this._patterns){const n=fi(e,t);if(n)return {element:e,pattern:t,match:n}}return null}matchAll(...t){const e=[];for(const n of t)for(const t of this._patterns){const i=fi(n,t);i&&e.push({element:n,pattern:t,match:i});}return e.length>0?e:null}getElementName(){if(1!==this._patterns.length)return null;const t=this._patterns[0],e=t.name;return "function"==typeof t||!e||e instanceof RegExp?null:e}}function fi(t,e){if("function"==typeof e)return e(t);const n={};return e.name&&(n.name=function(t,e){if(t instanceof RegExp)return t.test(e);return t===e}(e.name,t.name),!n.name)?null:e.attributes&&(n.attributes=function(t,e){const n=[];for(const i in t){const o=t[i];if(!e.hasAttribute(i))return null;{const t=e.getAttribute(i);if(!0===o)n.push(i);else if(o instanceof RegExp){if(!o.test(t))return null;n.push(i);}else{if(t!==o)return null;n.push(i);}}}return n}(e.attributes,t),!n.attributes)?null:!(e.classes&&(n.classes=function(t,e){const n=[];for(const i of t)if(i instanceof RegExp){const t=e.getClassNames();for(const e of t)i.test(e)&&n.push(e);if(0===n.length)return null}else{if(!e.hasClass(i))return null;n.push(i);}return n}(e.classes,t),!n.classes))&&(!(e.styles&&(n.styles=function(t,e){const n=[];for(const i in t){const o=t[i];if(!e.hasStyle(i))return null;{const t=e.getStyle(i);if(o instanceof RegExp){if(!o.test(t))return null;n.push(i);}else{if(t!==o)return null;n.push(i);}}}return n}(e.styles,t),!n.styles))&&n)}class mi extends ai{constructor(t,e,n){if(super(),this.name=t,this._attrs=function(t){t=C(t)?di(t):new Map(t);for(const[e,n]of t)null===n?t.delete(e):"string"!=typeof n&&t.set(e,String(n));return t}(e),this._children=[],n&&this._insertChild(0,n),this._classes=new Set,this._attrs.has("class")){const t=this._attrs.get("class");pi(this._classes,t),this._attrs.delete("class");}this._styles=new Map,this._attrs.has("style")&&(gi(this._styles,this._attrs.get("style")),this._attrs.delete("style")),this._customProperties=new Map;}get childCount(){return this._children.length}get isEmpty(){return 0===this._children.length}is(t,e=null){return e?"element"==t&&e==this.name:"element"==t||t==this.name||super.is(t)}getChild(t){return this._children[t]}getChildIndex(t){return this._children.indexOf(t)}getChildren(){return this._children[Symbol.iterator]()}*getAttributeKeys(){this._classes.size>0&&(yield "class"),this._styles.size>0&&(yield "style");for(const t of this._attrs.keys())yield t;}*getAttributes(){yield*this._attrs.entries(),this._classes.size>0&&(yield ["class",this.getAttribute("class")]),this._styles.size>0&&(yield ["style",this.getAttribute("style")]);}getAttribute(t){if("class"==t)return this._classes.size>0?[...this._classes].join(" "):void 0;if("style"!=t)return this._attrs.get(t);if(this._styles.size>0){let t="";for(const[e,n]of this._styles)t+=`${e}:${n};`;return t}}hasAttribute(t){return "class"==t?this._classes.size>0:"style"==t?this._styles.size>0:this._attrs.has(t)}isSimilar(t){if(!(t instanceof mi))return !1;if(this===t)return !0;if(this.name!=t.name)return !1;if(this._attrs.size!==t._attrs.size||this._classes.size!==t._classes.size||this._styles.size!==t._styles.size)return !1;for(const[e,n]of this._attrs)if(!t._attrs.has(e)||t._attrs.get(e)!==n)return !1;for(const e of this._classes)if(!t._classes.has(e))return !1;for(const[e,n]of this._styles)if(!t._styles.has(e)||t._styles.get(e)!==n)return !1;return !0}hasClass(...t){for(const e of t)if(!this._classes.has(e))return !1;return !0}getClassNames(){return this._classes.keys()}getStyle(t){return this._styles.get(t)}getStyleNames(){return this._styles.keys()}hasStyle(...t){for(const e of t)if(!this._styles.has(e))return !1;return !0}findAncestor(...t){const e=new hi(...t);let n=this.parent;for(;n;){if(e.match(n))return n;n=n.parent;}return null}getCustomProperty(t){return this._customProperties.get(t)}*getCustomProperties(){yield*this._customProperties.entries();}getIdentity(){const t=Array.from(this._classes).sort().join(","),e=Array.from(this._styles).map(t=>`${t[0]}:${t[1]}`).sort().join(";"),n=Array.from(this._attrs).map(t=>`${t[0]}="${t[1]}"`).sort().join(" ");return this.name+(""==t?"":` class="${t}"`)+(""==e?"":` style="${e}"`)+(""==n?"":` ${n}`)}_clone(t=!1){const e=[];if(t)for(const n of this.getChildren())e.push(n._clone(t));const n=new this.constructor(this.name,this._attrs,e);return n._classes=new Set(this._classes),n._styles=new Map(this._styles),n._customProperties=new Map(this._customProperties),n.getFillerOffset=this.getFillerOffset,n}_appendChild(t){return this._insertChild(this.childCount,t)}_insertChild(t,e){this._fireChange("children",this);let n=0;const i=function(t){if("string"==typeof t)return [new ci(t)];ui(t)||(t=[t]);return Array.from(t).map(t=>"string"==typeof t?new ci(t):t instanceof li?new ci(t.data):t)}(e);for(const e of i)null!==e.parent&&e._remove(),e.parent=this,this._children.splice(t,0,e),t++,n++;return n}_removeChildren(t,e=1){this._fireChange("children",this);for(let n=t;n<t+e;n++)this._children[n].parent=null;return this._children.splice(t,e)}_setAttribute(t,e){e=String(e),this._fireChange("attributes",this),"class"==t?pi(this._classes,e):"style"==t?gi(this._styles,e):this._attrs.set(t,e);}_removeAttribute(t){return this._fireChange("attributes",this),"class"==t?this._classes.size>0&&(this._classes.clear(),!0):"style"==t?this._styles.size>0&&(this._styles.clear(),!0):this._attrs.delete(t)}_addClass(t){this._fireChange("attributes",this),(t=Array.isArray(t)?t:[t]).forEach(t=>this._classes.add(t));}_removeClass(t){this._fireChange("attributes",this),(t=Array.isArray(t)?t:[t]).forEach(t=>this._classes.delete(t));}_setStyle(t,e){if(this._fireChange("attributes",this),C(t)){const e=Object.keys(t);for(const n of e)this._styles.set(n,t[n]);}else this._styles.set(t,e);}_removeStyle(t){this._fireChange("attributes",this),(t=Array.isArray(t)?t:[t]).forEach(t=>this._styles.delete(t));}_setCustomProperty(t,e){this._customProperties.set(t,e);}_removeCustomProperty(t){return this._customProperties.delete(t)}}function gi(t,e){let n=null,i=0,o=0,r=null;if(t.clear(),""!==e){";"!=e.charAt(e.length-1)&&(e+=";");for(let s=0;s<e.length;s++){const a=e.charAt(s);if(null===n)switch(a){case":":r||(r=e.substr(i,s-i),o=s+1);break;case'"':case"'":n=a;break;case";":{const n=e.substr(o,s-o);r&&t.set(r.trim(),n.trim()),r=null,i=s+1;break}}else a===n&&(n=null);}}}function pi(t,e){const n=e.split(/\s+/);t.clear(),n.forEach(e=>t.add(e));}class bi extends mi{constructor(t,e,n){super(t,e,n),this.getFillerOffset=wi;}is(t,e=null){return e?"containerElement"==t&&e==this.name||super.is(t,e):"containerElement"==t||super.is(t)}}function wi(){const t=[...this.getChildren()],e=t[this.childCount-1];if(e&&e.is("element","br"))return this.childCount;for(const e of t)if(!e.is("uiElement"))return null;return this.childCount}var _i=function(t){return t};var ki=function(t,e,n){switch(n.length){case 0:return t.call(e);case 1:return t.call(e,n[0]);case 2:return t.call(e,n[0],n[1]);case 3:return t.call(e,n[0],n[1],n[2])}return t.apply(e,n)},vi=Math.max;var yi=function(t,e,n){return e=vi(void 0===e?t.length-1:e,0),function(){for(var i=arguments,o=-1,r=vi(i.length-e,0),s=Array(r);++o<r;)s[o]=i[e+o];o=-1;for(var a=Array(e+1);++o<e;)a[o]=i[o];return a[e]=n(s),ki(t,this,a)}};var xi=function(t){return function(){return t}},Ai=Kt?function(t,e){return Kt(t,"toString",{configurable:!0,enumerable:!1,value:xi(e),writable:!0})}:_i,Ci=800,Ti=16,Pi=Date.now;var Mi=function(t){var e=0,n=0;return function(){var i=Pi(),o=Ti-(i-n);if(n=i,o>0){if(++e>=Ci)return arguments[0]}else e=0;return t.apply(void 0,arguments)}}(Ai);var Si=function(t,e){return Mi(yi(t,e,_i),t+"")};var Ii=function(t,e,n){if(!it(n))return !1;var i=typeof e;return !!("number"==i?Me(n)&&he(e,n.length):"string"==i&&e in n)&&q(n[e],t)};var Ei=function(t){return Si(function(e,n){var i=-1,o=n.length,r=o>1?n[o-1]:void 0,s=o>2?n[2]:void 0;for(r=t.length>3&&"function"==typeof r?(o--,r):void 0,s&&Ii(n[0],n[1],s)&&(r=o<3?void 0:r,o=1),e=Object(e);++i<o;){var a=n[i];a&&t(e,a,i,r);}return e})}(function(t,e){te(e,Re(e),t);});const Ni=Symbol("observableProperties"),Oi=Symbol("boundObservables"),Ri=Symbol("boundProperties"),Di={set(t,e){if(it(t))return void Object.keys(t).forEach(e=>{this.set(e,t[e]);},this);ji(this);const n=this[Ni];if(t in this&&!n.has(t))throw new P.b("observable-set-cannot-override: Cannot override an existing property.");Object.defineProperty(this,t,{enumerable:!0,configurable:!0,get:()=>n.get(t),set(e){const i=n.get(t);let o=this.fire("set:"+t,t,e,i);void 0===o&&(o=e),i===o&&n.has(t)||(n.set(t,o),this.fire("change:"+t,t,o,i));}}),this[t]=e;},bind(...t){if(!t.length||!Bi(t))throw new P.b("observable-bind-wrong-properties: All properties must be strings.");if(new Set(t).size!==t.length)throw new P.b("observable-bind-duplicate-properties: Properties must be unique.");ji(this);const e=this[Ri];t.forEach(t=>{if(e.has(t))throw new P.b("observable-bind-rebind: Cannot bind the same property more that once.")});const n=new Map;return t.forEach(t=>{const i={property:t,to:[]};e.set(t,i),n.set(t,i);}),{to:Vi,toMany:zi,_observable:this,_bindProperties:t,_to:[],_bindings:n}},unbind(...t){if(!(Ni in this))return;const e=this[Ri],n=this[Oi];if(t.length){if(!Bi(t))throw new P.b("observable-unbind-wrong-properties: Properties must be strings.");t.forEach(t=>{const i=e.get(t);if(!i)return;let o,r,s,a;i.to.forEach(t=>{o=t[0],r=t[1],s=n.get(o),(a=s[r]).delete(i),a.size||delete s[r],Object.keys(s).length||(n.delete(o),this.stopListening(o,"change"));}),e.delete(t);});}else n.forEach((t,e)=>{this.stopListening(e,"change");}),n.clear(),e.clear();},decorate(t){const e=this[t];if(!e)throw new P.b("observablemixin-cannot-decorate-undefined: Cannot decorate an undefined method.",{object:this,methodName:t});this.on(t,(t,n)=>{t.return=e.apply(this,n);}),this[t]=function(...e){return this.fire(t,e)};}};Ei(Di,R);var Li=Di;function ji(t){Ni in t||(Object.defineProperty(t,Ni,{value:new Map}),Object.defineProperty(t,Oi,{value:new Map}),Object.defineProperty(t,Ri,{value:new Map}));}function Vi(...t){const e=function(...t){if(!t.length)throw new P.b("observable-bind-to-parse-error: Invalid argument syntax in `to()`.");const e={to:[]};let n;"function"==typeof t[t.length-1]&&(e.callback=t.pop());return t.forEach(t=>{if("string"==typeof t)n.properties.push(t);else{if("object"!=typeof t)throw new P.b("observable-bind-to-parse-error: Invalid argument syntax in `to()`.");n={observable:t,properties:[]},e.to.push(n);}}),e}(...t),n=Array.from(this._bindings.keys()),i=n.length;if(!e.callback&&e.to.length>1)throw new P.b("observable-bind-to-no-callback: Binding multiple observables only possible with callback.");if(i>1&&e.callback)throw new P.b("observable-bind-to-extra-callback: Cannot bind multiple properties and use a callback in one binding.");e.to.forEach(t=>{if(t.properties.length&&t.properties.length!==i)throw new P.b("observable-bind-to-properties-length: The number of properties must match.");t.properties.length||(t.properties=this._bindProperties);}),this._to=e.to,e.callback&&(this._bindings.get(n[0]).callback=e.callback),function(t,e){e.forEach(e=>{const n=t[Oi];let i;n.get(e.observable)||t.listenTo(e.observable,"change",(o,r)=>{(i=n.get(e.observable)[r])&&i.forEach(e=>{Fi(t,e.property);});});});}(this._observable,this._to),function(t){let e;t._bindings.forEach((n,i)=>{t._to.forEach(o=>{e=o.properties[n.callback?0:t._bindProperties.indexOf(i)],n.to.push([o.observable,e]),function(t,e,n,i){const o=t[Oi],r=o.get(n),s=r||{};s[i]||(s[i]=new Set);s[i].add(e),r||o.set(n,s);}(t._observable,n,o.observable,e);});});}(this),this._bindProperties.forEach(t=>{Fi(this._observable,t);});}function zi(t,e,n){if(this._bindings.size>1)throw new P.b("observable-bind-to-many-not-one-binding: Cannot bind multiple properties with toMany().");this.to(...function(t,e){const n=t.map(t=>[t,e]);return Array.prototype.concat.apply([],n)}(t,e),n);}function Bi(t){return t.every(t=>"string"==typeof t)}function Fi(t,e){const n=t[Ri].get(e);let i;i=n.callback?n.callback.apply(t,n.to.map(t=>t[0][t[1]])):(i=n.to[0])[0][i[1]],t.hasOwnProperty(e)?t[e]=i:t.set(e,i);}const Ui=Symbol("document");class Hi extends bi{constructor(t,e,n){super(t,e,n),this.set("isReadOnly",!1),this.set("isFocused",!1);}is(t,e=null){return e?"editableElement"==t&&e==this.name||super.is(t,e):"editableElement"==t||super.is(t)}get document(){return this.getCustomProperty(Ui)}set _document(t){if(this.getCustomProperty(Ui))throw new P.b("view-editableelement-document-already-set: View document is already set.");this._setCustomProperty(Ui,t),this.bind("isReadOnly").to(t),this.bind("isFocused").to(t,"isFocused",e=>e&&t.selection.editableElement==this),this.listenTo(t.selection,"change",()=>{this.isFocused=t.isFocused&&t.selection.editableElement==this;});}}F(Hi,Li);const qi=Symbol("rootName");class Wi extends Hi{constructor(t){super(t),this.rootName="main";}is(t,e=null){return e?"rootElement"==t&&e==this.name||super.is(t,e):"rootElement"==t||super.is(t)}get rootName(){return this.getCustomProperty(qi)}set rootName(t){this._setCustomProperty(qi,t);}set _name(t){this.name=t;}}class Yi{constructor(t={}){if(!t.boundaries&&!t.startPosition)throw new P.b("view-tree-walker-no-start-position: Neither boundaries nor starting position have been defined.");if(t.direction&&"forward"!=t.direction&&"backward"!=t.direction)throw new P.b("view-tree-walker-unknown-direction: Only `backward` and `forward` direction allowed.",{direction:t.direction});this.boundaries=t.boundaries||null,t.startPosition?this.position=$i._createAt(t.startPosition):this.position=$i._createAt(t.boundaries["backward"==t.direction?"end":"start"]),this.direction=t.direction||"forward",this.singleCharacters=!!t.singleCharacters,this.shallow=!!t.shallow,this.ignoreElementEnd=!!t.ignoreElementEnd,this._boundaryStartParent=this.boundaries?this.boundaries.start.parent:null,this._boundaryEndParent=this.boundaries?this.boundaries.end.parent:null;}[Symbol.iterator](){return this}skip(t){let e,n,i;do{i=this.position,({done:e,value:n}=this.next());}while(!e&&t(n));e||(this.position=i);}next(){return "forward"==this.direction?this._next():this._previous()}_next(){let t=this.position.clone();const e=this.position,n=t.parent;if(null===n.parent&&t.offset===n.childCount)return {done:!0};if(n===this._boundaryEndParent&&t.offset==this.boundaries.end.offset)return {done:!0};let i;if(n instanceof ci){if(t.isAtEnd)return this.position=$i._createAfter(n),this._next();i=n.data[t.offset];}else i=n.getChild(t.offset);if(i instanceof mi)return this.shallow?t.offset++:t=new $i(i,0),this.position=t,this._formatReturnValue("elementStart",i,e,t,1);if(i instanceof ci){if(this.singleCharacters)return t=new $i(i,0),this.position=t,this._next();{let n,o=i.data.length;return i==this._boundaryEndParent?(o=this.boundaries.end.offset,n=new li(i,0,o),t=$i._createAfter(n)):(n=new li(i,0,i.data.length),t.offset++),this.position=t,this._formatReturnValue("text",n,e,t,o)}}if("string"==typeof i){let i;if(this.singleCharacters)i=1;else{i=(n===this._boundaryEndParent?this.boundaries.end.offset:n.data.length)-t.offset;}const o=new li(n,t.offset,i);return t.offset+=i,this.position=t,this._formatReturnValue("text",o,e,t,i)}return t=$i._createAfter(n),this.position=t,this.ignoreElementEnd?this._next():this._formatReturnValue("elementEnd",n,e,t)}_previous(){let t=this.position.clone();const e=this.position,n=t.parent;if(null===n.parent&&0===t.offset)return {done:!0};if(n==this._boundaryStartParent&&t.offset==this.boundaries.start.offset)return {done:!0};let i;if(n instanceof ci){if(t.isAtStart)return this.position=$i._createBefore(n),this._previous();i=n.data[t.offset-1];}else i=n.getChild(t.offset-1);if(i instanceof mi)return this.shallow?(t.offset--,this.position=t,this._formatReturnValue("elementStart",i,e,t,1)):(t=new $i(i,i.childCount),this.position=t,this.ignoreElementEnd?this._previous():this._formatReturnValue("elementEnd",i,e,t));if(i instanceof ci){if(this.singleCharacters)return t=new $i(i,i.data.length),this.position=t,this._previous();{let n,o=i.data.length;if(i==this._boundaryStartParent){const e=this.boundaries.start.offset;o=(n=new li(i,e,i.data.length-e)).data.length,t=$i._createBefore(n);}else n=new li(i,0,i.data.length),t.offset--;return this.position=t,this._formatReturnValue("text",n,e,t,o)}}if("string"==typeof i){let i;if(this.singleCharacters)i=1;else{const e=n===this._boundaryStartParent?this.boundaries.start.offset:0;i=t.offset-e;}t.offset-=i;const o=new li(n,t.offset,i);return this.position=t,this._formatReturnValue("text",o,e,t,i)}return t=$i._createBefore(n),this.position=t,this._formatReturnValue("elementStart",n,e,t,1)}_formatReturnValue(t,e,n,i,o){return e instanceof li&&(e.offsetInText+e.data.length==e.textNode.data.length&&("forward"!=this.direction||this.boundaries&&this.boundaries.end.isEqual(this.position)?n=$i._createAfter(e.textNode):(i=$i._createAfter(e.textNode),this.position=i)),0===e.offsetInText&&("backward"!=this.direction||this.boundaries&&this.boundaries.start.isEqual(this.position)?n=$i._createBefore(e.textNode):(i=$i._createBefore(e.textNode),this.position=i))),{done:!1,value:{type:t,item:e,previousPosition:n,nextPosition:i,length:o}}}}class $i{constructor(t,e){this.parent=t,this.offset=e;}get nodeAfter(){return this.parent.is("text")?null:this.parent.getChild(this.offset)||null}get nodeBefore(){return this.parent.is("text")?null:this.parent.getChild(this.offset-1)||null}get isAtStart(){return 0===this.offset}get isAtEnd(){const t=this.parent.is("text")?this.parent.data.length:this.parent.childCount;return this.offset===t}get root(){return this.parent.root}get editableElement(){let t=this.parent;for(;!(t instanceof Hi);){if(!t.parent)return null;t=t.parent;}return t}getShiftedBy(t){const e=$i._createAt(this),n=e.offset+t;return e.offset=n<0?0:n,e}getLastMatchingPosition(t,e={}){e.startPosition=this;const n=new Yi(e);return n.skip(t),n.position}getAncestors(){return this.parent.is("documentFragment")?[this.parent]:this.parent.getAncestors({includeSelf:!0})}getCommonAncestor(t){const e=this.getAncestors(),n=t.getAncestors();let i=0;for(;e[i]==n[i]&&e[i];)i++;return 0===i?null:e[i-1]}isEqual(t){return this.parent==t.parent&&this.offset==t.offset}isBefore(t){return "before"==this.compareWith(t)}isAfter(t){return "after"==this.compareWith(t)}compareWith(t){if(this.root!==t.root)return "different";if(this.isEqual(t))return "same";const e=this.parent.is("node")?this.parent.getPath():[],n=t.parent.is("node")?t.parent.getPath():[];e.push(this.offset),n.push(t.offset);const i=U(e,n);switch(i){case"prefix":return "before";case"extension":return "after";default:return e[i]<n[i]?"before":"after"}}getWalker(t={}){return t.startPosition=this,new Yi(t)}clone(){return new $i(this.parent,this.offset)}static _createAt(t,e){if(t instanceof $i)return new this(t.parent,t.offset);{const n=t;if("end"==e)e=n.is("text")?n.data.length:n.childCount;else{if("before"==e)return this._createBefore(n);if("after"==e)return this._createAfter(n);if(0!==e&&!e)throw new P.b("view-createPositionAt-offset-required: View#createPositionAt() requires the offset when the first parameter is a view item.")}return new $i(n,e)}}static _createAfter(t){if(t.is("textProxy"))return new $i(t.textNode,t.offsetInText+t.data.length);if(!t.parent)throw new P.b("view-position-after-root: You can not make position after root.",{root:t});return new $i(t.parent,t.index+1)}static _createBefore(t){if(t.is("textProxy"))return new $i(t.textNode,t.offsetInText);if(!t.parent)throw new P.b("view-position-before-root: You can not make position before root.",{root:t});return new $i(t.parent,t.index)}}class Gi{constructor(t,e=null){this.start=t.clone(),this.end=e?e.clone():t.clone();}*[Symbol.iterator](){yield*new Yi({boundaries:this,ignoreElementEnd:!0});}get isCollapsed(){return this.start.isEqual(this.end)}get isFlat(){return this.start.parent===this.end.parent}get root(){return this.start.root}getEnlarged(){let t=this.start.getLastMatchingPosition(Qi,{direction:"backward"}),e=this.end.getLastMatchingPosition(Qi);return t.parent.is("text")&&t.isAtStart&&(t=$i._createBefore(t.parent)),e.parent.is("text")&&e.isAtEnd&&(e=$i._createAfter(e.parent)),new Gi(t,e)}getTrimmed(){let t=this.start.getLastMatchingPosition(Qi);if(t.isAfter(this.end)||t.isEqual(this.end))return new Gi(t,t);let e=this.end.getLastMatchingPosition(Qi,{direction:"backward"});const n=t.nodeAfter,i=e.nodeBefore;return n&&n.is("text")&&(t=new $i(n,0)),i&&i.is("text")&&(e=new $i(i,i.data.length)),new Gi(t,e)}isEqual(t){return this==t||this.start.isEqual(t.start)&&this.end.isEqual(t.end)}containsPosition(t){return t.isAfter(this.start)&&t.isBefore(this.end)}containsRange(t,e=!1){t.isCollapsed&&(e=!1);const n=this.containsPosition(t.start)||e&&this.start.isEqual(t.start),i=this.containsPosition(t.end)||e&&this.end.isEqual(t.end);return n&&i}getDifference(t){const e=[];return this.isIntersecting(t)?(this.containsPosition(t.start)&&e.push(new Gi(this.start,t.start)),this.containsPosition(t.end)&&e.push(new Gi(t.end,this.end))):e.push(this.clone()),e}getIntersection(t){if(this.isIntersecting(t)){let e=this.start,n=this.end;return this.containsPosition(t.start)&&(e=t.start),this.containsPosition(t.end)&&(n=t.end),new Gi(e,n)}return null}getWalker(t={}){return t.boundaries=this,new Yi(t)}getCommonAncestor(){return this.start.getCommonAncestor(this.end)}clone(){return new Gi(this.start,this.end)}*getItems(t={}){t.boundaries=this,t.ignoreElementEnd=!0;const e=new Yi(t);for(const t of e)yield t.item;}*getPositions(t={}){t.boundaries=this;const e=new Yi(t);yield e.position;for(const t of e)yield t.nextPosition;}isIntersecting(t){return this.start.isBefore(t.end)&&this.end.isAfter(t.start)}static _createFromParentsAndOffsets(t,e,n,i){return new this(new $i(t,e),new $i(n,i))}static _createFromPositionAndShift(t,e){const n=t,i=t.getShiftedBy(e);return e>0?new this(n,i):new this(i,n)}static _createIn(t){return this._createFromParentsAndOffsets(t,0,t,t.childCount)}static _createOn(t){const e=t.is("textProxy")?t.offsetSize:1;return this._createFromPositionAndShift($i._createBefore(t),e)}}function Qi(t){return !(!t.item.is("attributeElement")&&!t.item.is("uiElement"))}function Ki(t){let e=0;for(const n of t)e++;return e}class Ji{constructor(t=null,e,n){this._ranges=[],this._lastRangeBackward=!1,this._isFake=!1,this._fakeSelectionLabel="",this.setTo(t,e,n);}get isFake(){return this._isFake}get fakeSelectionLabel(){return this._fakeSelectionLabel}get anchor(){if(!this._ranges.length)return null;const t=this._ranges[this._ranges.length-1];return (this._lastRangeBackward?t.end:t.start).clone()}get focus(){if(!this._ranges.length)return null;const t=this._ranges[this._ranges.length-1];return (this._lastRangeBackward?t.start:t.end).clone()}get isCollapsed(){return 1===this.rangeCount&&this._ranges[0].isCollapsed}get rangeCount(){return this._ranges.length}get isBackward(){return !this.isCollapsed&&this._lastRangeBackward}get editableElement(){return this.anchor?this.anchor.editableElement:null}*getRanges(){for(const t of this._ranges)yield t.clone();}getFirstRange(){let t=null;for(const e of this._ranges)t&&!e.start.isBefore(t.start)||(t=e);return t?t.clone():null}getLastRange(){let t=null;for(const e of this._ranges)t&&!e.end.isAfter(t.end)||(t=e);return t?t.clone():null}getFirstPosition(){const t=this.getFirstRange();return t?t.start.clone():null}getLastPosition(){const t=this.getLastRange();return t?t.end.clone():null}isEqual(t){if(this.isFake!=t.isFake)return !1;if(this.isFake&&this.fakeSelectionLabel!=t.fakeSelectionLabel)return !1;if(this.rangeCount!=t.rangeCount)return !1;if(0===this.rangeCount)return !0;if(!this.anchor.isEqual(t.anchor)||!this.focus.isEqual(t.focus))return !1;for(const e of this._ranges){let n=!1;for(const i of t._ranges)if(e.isEqual(i)){n=!0;break}if(!n)return !1}return !0}isSimilar(t){if(this.isBackward!=t.isBackward)return !1;const e=Ki(this.getRanges());if(e!=Ki(t.getRanges()))return !1;if(0==e)return !0;for(let e of this.getRanges()){e=e.getTrimmed();let n=!1;for(let i of t.getRanges())if(i=i.getTrimmed(),e.start.isEqual(i.start)&&e.end.isEqual(i.end)){n=!0;break}if(!n)return !1}return !0}getSelectedElement(){if(1!==this.rangeCount)return null;const t=this.getFirstRange(),e=t.start.nodeAfter,n=t.end.nodeBefore;return e instanceof mi&&e==n?e:null}setTo(t,e,n){if(null===t)this._setRanges([]),this._setFakeOptions(e);else if(t instanceof Ji||t instanceof Zi)this._setRanges(t.getRanges(),t.isBackward),this._setFakeOptions({fake:t.isFake,label:t.fakeSelectionLabel});else if(t instanceof Gi)this._setRanges([t],e&&e.backward),this._setFakeOptions(e);else if(t instanceof $i)this._setRanges([new Gi(t)]),this._setFakeOptions(e);else if(t instanceof ai){const i=!!n&&!!n.backward;let o;if(void 0===e)throw new P.b("view-selection-setTo-required-second-parameter: selection.setTo requires the second parameter when the first parameter is a node.");o="in"==e?Gi._createIn(t):"on"==e?Gi._createOn(t):new Gi($i._createAt(t,e)),this._setRanges([o],i),this._setFakeOptions(n);}else{if(!ui(t))throw new P.b("view-selection-setTo-not-selectable: Cannot set selection to given place.");this._setRanges(t,e&&e.backward),this._setFakeOptions(e);}this.fire("change");}setFocus(t,e){if(null===this.anchor)throw new P.b("view-selection-setFocus-no-ranges: Cannot set selection focus if there are no ranges in selection.");const n=$i._createAt(t,e);if("same"==n.compareWith(this.focus))return;const i=this.anchor;this._ranges.pop(),"before"==n.compareWith(i)?this._addRange(new Gi(n,i),!0):this._addRange(new Gi(i,n)),this.fire("change");}_setRanges(t,e=!1){t=Array.from(t),this._ranges=[];for(const e of t)this._addRange(e);this._lastRangeBackward=!!e;}_setFakeOptions(t={}){this._isFake=!!t.fake,this._fakeSelectionLabel=t.fake&&t.label||"";}_addRange(t,e=!1){if(!(t instanceof Gi))throw new P.b("view-selection-add-range-not-range: Selection range set to an object that is not an instance of view.Range");this._pushRange(t),this._lastRangeBackward=!!e;}_pushRange(t){for(const e of this._ranges)if(t.isIntersecting(e))throw new P.b("view-selection-range-intersects: Trying to add a range that intersects with another range from selection.",{addedRange:t,intersectingRange:e});this._ranges.push(new Gi(t.start,t.end));}}F(Ji,R);class Zi{constructor(t=null,e,n){this._selection=new Ji,this._selection.delegate("change").to(this),this._selection.setTo(t,e,n);}get isFake(){return this._selection.isFake}get fakeSelectionLabel(){return this._selection.fakeSelectionLabel}get anchor(){return this._selection.anchor}get focus(){return this._selection.focus}get isCollapsed(){return this._selection.isCollapsed}get rangeCount(){return this._selection.rangeCount}get isBackward(){return this._selection.isBackward}get editableElement(){return this._selection.editableElement}get _ranges(){return this._selection._ranges}*getRanges(){yield*this._selection.getRanges();}getFirstRange(){return this._selection.getFirstRange()}getLastRange(){return this._selection.getLastRange()}getFirstPosition(){return this._selection.getFirstPosition()}getLastPosition(){return this._selection.getLastPosition()}getSelectedElement(){return this._selection.getSelectedElement()}isEqual(t){return this._selection.isEqual(t)}isSimilar(t){return this._selection.isSimilar(t)}_setTo(t,e,n){this._selection.setTo(t,e,n);}_setFocus(t,e){this._selection.setFocus(t,e);}}F(Zi,R);class Xi{constructor(t={}){this._items=[],this._itemMap=new Map,this._idProperty=t.idProperty||"id",this._bindToExternalToInternalMap=new WeakMap,this._bindToInternalToExternalMap=new WeakMap,this._skippedIndexesFromExternal=[];}get length(){return this._items.length}get first(){return this._items[0]||null}get last(){return this._items[this.length-1]||null}add(t,e){let n;const i=this._idProperty;if(i in t){if("string"!=typeof(n=t[i]))throw new P.b("collection-add-invalid-id");if(this.get(n))throw new P.b("collection-add-item-already-exists")}else t[i]=n=I();if(void 0===e)e=this._items.length;else if(e>this._items.length||e<0)throw new P.b("collection-add-item-invalid-index");return this._items.splice(e,0,t),this._itemMap.set(n,t),this.fire("add",t,e),this}get(t){let e;if("string"==typeof t)e=this._itemMap.get(t);else{if("number"!=typeof t)throw new P.b("collection-get-invalid-arg: Index or id must be given.");e=this._items[t];}return e||null}getIndex(t){let e;return e="string"==typeof t?this._itemMap.get(t):t,this._items.indexOf(e)}remove(t){let e,n,i,o=!1;const r=this._idProperty;if("string"==typeof t?(n=t,o=!(i=this._itemMap.get(n)),i&&(e=this._items.indexOf(i))):"number"==typeof t?(e=t,o=!(i=this._items[e]),i&&(n=i[r])):(n=(i=t)[r],o=-1==(e=this._items.indexOf(i))||!this._itemMap.get(n)),o)throw new P.b("collection-remove-404: Item not found.");this._items.splice(e,1),this._itemMap.delete(n);const s=this._bindToInternalToExternalMap.get(i);return this._bindToInternalToExternalMap.delete(i),this._bindToExternalToInternalMap.delete(s),this.fire("remove",i,e),i}map(t,e){return this._items.map(t,e)}find(t,e){return this._items.find(t,e)}filter(t,e){return this._items.filter(t,e)}clear(){for(this._bindToCollection&&(this.stopListening(this._bindToCollection),this._bindToCollection=null);this.length;)this.remove(0);}bindTo(t){if(this._bindToCollection)throw new P.b("collection-bind-to-rebind: The collection cannot be bound more than once.");return this._bindToCollection=t,{as:t=>{this._setUpBindToBinding(e=>new t(e));},using:t=>{"function"==typeof t?this._setUpBindToBinding(e=>t(e)):this._setUpBindToBinding(e=>e[t]);}}}_setUpBindToBinding(t){const e=this._bindToCollection,n=(n,i,o)=>{const r=e._bindToCollection==this,s=e._bindToInternalToExternalMap.get(i);if(r&&s)this._bindToExternalToInternalMap.set(i,s),this._bindToInternalToExternalMap.set(s,i);else{const n=t(i);if(!n)return void this._skippedIndexesFromExternal.push(o);let r=o;for(const t of this._skippedIndexesFromExternal)o>t&&r--;for(const t of e._skippedIndexesFromExternal)r>=t&&r++;this._bindToExternalToInternalMap.set(i,n),this._bindToInternalToExternalMap.set(n,i),this.add(n,r);for(let t=0;t<e._skippedIndexesFromExternal.length;t++)r<=e._skippedIndexesFromExternal[t]&&e._skippedIndexesFromExternal[t]++;}};for(const t of e)n(0,t,e.getIndex(t));this.listenTo(e,"add",n),this.listenTo(e,"remove",(t,e,n)=>{const i=this._bindToExternalToInternalMap.get(e);i&&this.remove(i),this._skippedIndexesFromExternal=this._skippedIndexesFromExternal.reduce((t,e)=>(n<e&&t.push(e-1),n>e&&t.push(e),t),[]);});}[Symbol.iterator](){return this._items[Symbol.iterator]()}}F(Xi,R);class to{constructor(){this.selection=new Zi,this.roots=new Xi({idProperty:"rootName"}),this.set("isReadOnly",!1),this.set("isFocused",!1),this.set("isComposing",!1),this._postFixers=new Set;}getRoot(t="main"){return this.roots.get(t)}registerPostFixer(t){this._postFixers.add(t);}_callPostFixers(t){let e=!1;do{for(const n of this._postFixers)if(e=n(t))break}while(e)}}F(to,Li);const eo=10;class no extends mi{constructor(t,e,n){super(t,e,n),this.getFillerOffset=io,this._priority=eo,this._id=null,this._clonesGroup=null;}get priority(){return this._priority}get id(){return this._id}getElementsWithSameId(){if(null===this.id)throw new P.b("attribute-element-get-elements-with-same-id-no-id: Cannot get elements with the same id for an attribute element without id.");return new Set(this._clonesGroup)}is(t,e=null){return e?"attributeElement"==t&&e==this.name||super.is(t,e):"attributeElement"==t||super.is(t)}isSimilar(t){return null!==this.id||null!==t.id?this.id===t.id:super.isSimilar(t)&&this.priority==t.priority}_clone(t){const e=super._clone(t);return e._priority=this._priority,e._id=this._id,e}}function io(){if(oo(this))return null;let t=this.parent;for(;t&&t.is("attributeElement");){if(oo(t)>1)return null;t=t.parent;}return !t||oo(t)>1?null:this.childCount}function oo(t){return Array.from(t.getChildren()).filter(t=>!t.is("uiElement")).length}no.DEFAULT_PRIORITY=eo;class ro extends mi{constructor(t,e,n){super(t,e,n),this.getFillerOffset=so;}is(t,e=null){return e?"emptyElement"==t&&e==this.name||super.is(t,e):"emptyElement"==t||super.is(t)}_insertChild(t,e){if(e&&(e instanceof ai||Array.from(e).length>0))throw new P.b("view-emptyelement-cannot-add: Cannot add child nodes to EmptyElement instance.")}}function so(){return null}const ao=navigator.userAgent.toLowerCase();var co={isMac:function(t){return t.indexOf("macintosh")>-1}(ao),isEdge:function(t){return !!t.match(/edge\/(\d+.?\d*)/)}(ao),isGecko:function(t){return !!t.match(/gecko\/\d+/)}(ao)};const lo={"⌘":"ctrl","⇧":"shift","⌥":"alt"},uo={ctrl:"⌘",shift:"⇧",alt:"⌥"},ho=function(){const t={arrowleft:37,arrowup:38,arrowright:39,arrowdown:40,backspace:8,delete:46,enter:13,space:32,esc:27,tab:9,ctrl:1114112,cmd:1114112,shift:2228224,alt:4456448};for(let e=65;e<=90;e++){const n=String.fromCharCode(e);t[n.toLowerCase()]=e;}for(let e=48;e<=57;e++)t[e-48]=e;for(let e=112;e<=123;e++)t["f"+(e-111)]=e;return t}();function fo(t){let e;if("string"==typeof t){if(!(e=ho[t.toLowerCase()]))throw new P.b("keyboard-unknown-key: Unknown key name.",{key:t})}else e=t.keyCode+(t.altKey?ho.alt:0)+(t.ctrlKey?ho.ctrl:0)+(t.shiftKey?ho.shift:0);return e}function mo(t){return "string"==typeof t&&(t=go(t)),t.map(t=>"string"==typeof t?fo(t):t).reduce((t,e)=>e+t,0)}function go(t){return t.split(/\s*\+\s*/)}class po extends mi{constructor(t,e,n){super(t,e,n),this.getFillerOffset=wo;}is(t,e=null){return e?"uiElement"==t&&e==this.name||super.is(t,e):"uiElement"==t||super.is(t)}_insertChild(t,e){if(e&&(e instanceof ai||Array.from(e).length>0))throw new P.b("view-uielement-cannot-add: Cannot add child nodes to UIElement instance.")}render(t){return this.toDomElement(t)}toDomElement(t){const e=t.createElement(this.name);for(const t of this.getAttributeKeys())e.setAttribute(t,this.getAttribute(t));return e}}function bo(t){t.document.on("keydown",(e,n)=>(function(t,e,n){if(e.keyCode==ho.arrowright){const t=e.domTarget.ownerDocument.defaultView.getSelection(),i=1==t.rangeCount&&t.getRangeAt(0).collapsed;if(i||e.shiftKey){const e=t.focusNode,o=t.focusOffset,r=n.domPositionToView(e,o);if(null===r)return;let s=!1;const a=r.getLastMatchingPosition(t=>(t.item.is("uiElement")&&(s=!0),!(!t.item.is("uiElement")&&!t.item.is("attributeElement"))));if(s){const e=n.viewPositionToDom(a);i?t.collapse(e.parent,e.offset):t.extend(e.parent,e.offset);}}}})(0,n,t.domConverter));}function wo(){return null}class _o{constructor(t){this._children=[],t&&this._insertChild(0,t);}[Symbol.iterator](){return this._children[Symbol.iterator]()}get childCount(){return this._children.length}get isEmpty(){return 0===this.childCount}get root(){return this}get parent(){return null}is(t){return "documentFragment"==t}_appendChild(t){return this._insertChild(this.childCount,t)}getChild(t){return this._children[t]}getChildIndex(t){return this._children.indexOf(t)}getChildren(){return this._children[Symbol.iterator]()}_insertChild(t,e){this._fireChange("children",this);let n=0;const i=function(t){if("string"==typeof t)return [new ci(t)];ui(t)||(t=[t]);return Array.from(t).map(t=>"string"==typeof t?new ci(t):t instanceof li?new ci(t.data):t)}(e);for(const e of i)null!==e.parent&&e._remove(),e.parent=this,this._children.splice(t,0,e),t++,n++;return n}_removeChildren(t,e=1){this._fireChange("children",this);for(let n=t;n<t+e;n++)this._children[n].parent=null;return this._children.splice(t,e)}_fireChange(t,e){this.fire("change:"+t,e);}}F(_o,R);class ko{constructor(t){this.document=t,this._cloneGroups=new Map;}setSelection(t,e,n){this.document.selection._setTo(t,e,n);}setSelectionFocus(t,e){this.document.selection._setFocus(t,e);}createText(t){return new ci(t)}createAttributeElement(t,e,n={}){const i=new no(t,e);return n.priority&&(i._priority=n.priority),n.id&&(i._id=n.id),i}createContainerElement(t,e){return new bi(t,e)}createEditableElement(t,e){const n=new Hi(t,e);return n._document=this.document,n}createEmptyElement(t,e){return new ro(t,e)}createUIElement(t,e,n){const i=new po(t,e);return n&&(i.render=n),i}setAttribute(t,e,n){n._setAttribute(t,e);}removeAttribute(t,e){e._removeAttribute(t);}addClass(t,e){e._addClass(t);}removeClass(t,e){e._removeClass(t);}setStyle(t,e,n){C(t)&&void 0===n&&(n=e),n._setStyle(t,e);}removeStyle(t,e){e._removeStyle(t);}setCustomProperty(t,e,n){n._setCustomProperty(t,e);}removeCustomProperty(t,e){return e._removeCustomProperty(t)}breakAttributes(t){return t instanceof $i?this._breakAttributes(t):this._breakAttributesRange(t)}breakContainer(t){const e=t.parent;if(!e.is("containerElement"))throw new P.b("view-writer-break-non-container-element: Trying to break an element which is not a container element.");if(!e.parent)throw new P.b("view-writer-break-root: Trying to break root element.");if(t.isAtStart)return $i._createBefore(e);if(!t.isAtEnd){const n=e._clone(!1);this.insert($i._createAfter(e),n);const i=new Gi(t,$i._createAt(e,"end")),o=new $i(n,0);this.move(i,o);}return $i._createAfter(e)}mergeAttributes(t){const e=t.offset,n=t.parent;if(n.is("text"))return t;if(n.is("attributeElement")&&0===n.childCount){const t=n.parent,e=n.index;return n._remove(),this._removeFromClonedElementsGroup(n),this.mergeAttributes(new $i(t,e))}const i=n.getChild(e-1),o=n.getChild(e);if(!i||!o)return t;if(i.is("text")&&o.is("text"))return Co(i,o);if(i.is("attributeElement")&&o.is("attributeElement")&&i.isSimilar(o)){const t=i.childCount;return i._appendChild(o.getChildren()),o._remove(),this._removeFromClonedElementsGroup(o),this.mergeAttributes(new $i(i,t))}return t}mergeContainers(t){const e=t.nodeBefore,n=t.nodeAfter;if(!(e&&n&&e.is("containerElement")&&n.is("containerElement")))throw new P.b("view-writer-merge-containers-invalid-position: Element before and after given position cannot be merged.");const i=e.getChild(e.childCount-1),o=i instanceof ci?$i._createAt(i,"end"):$i._createAt(e,"end");return this.move(Gi._createIn(n),$i._createAt(e,"end")),this.remove(Gi._createOn(n)),o}insert(t,e){(function t(e){for(const n of e){if(!To.some(t=>n instanceof t))throw new P.b("view-writer-insert-invalid-node");n.is("text")||t(n.getChildren());}})(e=ui(e)?[...e]:[e]);const n=vo(t);if(!n)throw new P.b("view-writer-invalid-position-container");const i=this._breakAttributes(t,!0),o=n._insertChild(i.offset,e);for(const t of e)this._addToClonedElementsGroup(t);const r=i.getShiftedBy(o),s=this.mergeAttributes(i);if(0===o)return new Gi(s,s);{s.isEqual(i)||r.offset--;const t=this.mergeAttributes(r);return new Gi(s,t)}}remove(t){const e=t instanceof Gi?t:Gi._createOn(t);if(Mo(e),e.isCollapsed)return new _o;const{start:n,end:i}=this._breakAttributesRange(e,!0),o=n.parent,r=i.offset-n.offset,s=o._removeChildren(n.offset,r);for(const t of s)this._removeFromClonedElementsGroup(t);const a=this.mergeAttributes(n);return e.start=a,e.end=a.clone(),new _o(s)}clear(t,e){Mo(t);const n=t.getWalker({direction:"backward",ignoreElementEnd:!0});for(const i of n){const n=i.item;let o;if(n.is("element")&&e.isSimilar(n))o=Gi._createOn(n);else if(!i.nextPosition.isAfter(t.start)&&n.is("textProxy")){const t=n.getAncestors().find(t=>t.is("element")&&e.isSimilar(t));t&&(o=Gi._createIn(t));}o&&(o.end.isAfter(t.end)&&(o.end=t.end),o.start.isBefore(t.start)&&(o.start=t.start),this.remove(o));}}move(t,e){let n;if(e.isAfter(t.end)){const i=(e=this._breakAttributes(e,!0)).parent,o=i.childCount;t=this._breakAttributesRange(t,!0),n=this.remove(t),e.offset+=i.childCount-o;}else n=this.remove(t);return this.insert(e,n)}wrap(t,e){if(!(e instanceof no))throw new P.b("view-writer-wrap-invalid-attribute");if(Mo(t),t.isCollapsed){let n=t.start;n.parent.is("element")&&!function(t){return Array.from(t.getChildren()).some(t=>!t.is("uiElement"))}(n.parent)&&(n=n.getLastMatchingPosition(t=>t.item.is("uiElement"))),n=this._wrapPosition(n,e);const i=this.document.selection;return i.isCollapsed&&i.getFirstPosition().isEqual(t.start)&&this.setSelection(n),new Gi(n)}return this._wrapRange(t,e)}unwrap(t,e){if(!(e instanceof no))throw new P.b("view-writer-unwrap-invalid-attribute");if(Mo(t),t.isCollapsed)return t;const{start:n,end:i}=this._breakAttributesRange(t,!0);if(i.isEqual(n.getShiftedBy(1))){const t=n.nodeAfter;if(!e.isSimilar(t)&&t instanceof no&&this._unwrapAttributeElement(e,t)){const t=this.mergeAttributes(n);t.isEqual(n)||i.offset--;const e=this.mergeAttributes(i);return new Gi(t,e)}}const o=n.parent,r=this._unwrapChildren(o,n.offset,i.offset,e),s=this.mergeAttributes(r.start);s.isEqual(r.start)||r.end.offset--;const a=this.mergeAttributes(r.end);return new Gi(s,a)}rename(t,e){const n=new bi(t,e.getAttributes());return this.insert($i._createAfter(e),n),this.move(Gi._createIn(e),$i._createAt(n,0)),this.remove(Gi._createOn(e)),n}clearClonedElementsGroup(t){this._cloneGroups.delete(t);}createPositionAt(t,e){return $i._createAt(t,e)}createPositionAfter(t){return $i._createAfter(t)}createPositionBefore(t){return $i._createBefore(t)}createRange(t,e){return new Gi(t,e)}createRangeOn(t){return Gi._createOn(t)}createRangeIn(t){return Gi._createIn(t)}createSelection(t,e,n){return new Ji(t,e,n)}_wrapChildren(t,e,n,i){let o=e;const r=[];for(;o<n;){const e=t.getChild(o),n=e.is("text"),s=e.is("attributeElement"),a=e.is("emptyElement"),c=e.is("uiElement");if(n||a||c||s&&yo(i,e)){const n=i._clone();e._remove(),n._appendChild(e),t._insertChild(o,n),this._addToClonedElementsGroup(n),r.push(new $i(t,o));}else s&&this._wrapChildren(e,0,e.childCount,i);o++;}let s=0;for(const t of r){if(t.offset-=s,t.offset==e)continue;this.mergeAttributes(t).isEqual(t)||(s++,n--);}return Gi._createFromParentsAndOffsets(t,e,t,n)}_unwrapChildren(t,e,n,i){let o=e;const r=[];for(;o<n;){const e=t.getChild(o);if(e.isSimilar(i)){const i=e.getChildren(),s=e.childCount;e._remove(),t._insertChild(o,i),this._removeFromClonedElementsGroup(e),r.push(new $i(t,o),new $i(t,o+s)),o+=s,n+=s-1;}else e.is("attributeElement")&&this._unwrapChildren(e,0,e.childCount,i),o++;}let s=0;for(const t of r){if(t.offset-=s,t.offset==e||t.offset==n)continue;this.mergeAttributes(t).isEqual(t)||(s++,n--);}return Gi._createFromParentsAndOffsets(t,e,t,n)}_wrapRange(t,e){if(function(t){return t.start.parent==t.end.parent&&t.start.parent.is("attributeElement")&&0===t.start.offset&&t.end.offset===t.start.parent.childCount}(t)&&this._wrapAttributeElement(e,t.start.parent)){const e=t.start.parent,n=this.mergeAttributes($i._createAfter(e)),i=this.mergeAttributes($i._createBefore(e));return new Gi(i,n)}const{start:n,end:i}=this._breakAttributesRange(t,!0);if(i.isEqual(n.getShiftedBy(1))){const t=n.nodeAfter;if(t instanceof no&&this._wrapAttributeElement(e,t)){const t=this.mergeAttributes(n);t.isEqual(n)||i.offset--;const e=this.mergeAttributes(i);return new Gi(t,e)}}const o=n.parent,r=this._unwrapChildren(o,n.offset,i.offset,e),s=this._wrapChildren(o,r.start.offset,r.end.offset,e),a=this.mergeAttributes(s.start);a.isEqual(s.start)||s.end.offset--;const c=this.mergeAttributes(s.end);return new Gi(a,c)}_wrapPosition(t,e){if(e.isSimilar(t.parent))return xo(t.clone());t.parent.is("text")&&(t=Ao(t));const n=this.createAttributeElement();n._priority=Number.POSITIVE_INFINITY,n.isSimilar=(()=>!1),t.parent._insertChild(t.offset,n);const i=new Gi(t,t.getShiftedBy(1));this.wrap(i,e);const o=new $i(n.parent,n.index);n._remove();const r=o.nodeBefore,s=o.nodeAfter;return r instanceof ci&&s instanceof ci?Co(r,s):xo(o)}_wrapAttributeElement(t,e){if(!So(t,e))return !1;if(t.name!==e.name||t.priority!==e.priority)return !1;for(const n of t.getAttributeKeys())if("class"!==n&&"style"!==n&&e.hasAttribute(n)&&e.getAttribute(n)!==t.getAttribute(n))return !1;for(const n of t.getStyleNames())if(e.hasStyle(n)&&e.getStyle(n)!==t.getStyle(n))return !1;for(const n of t.getAttributeKeys())"class"!==n&&"style"!==n&&(e.hasAttribute(n)||this.setAttribute(n,t.getAttribute(n),e));for(const n of t.getStyleNames())e.hasStyle(n)||this.setStyle(n,t.getStyle(n),e);for(const n of t.getClassNames())e.hasClass(n)||this.addClass(n,e);return !0}_unwrapAttributeElement(t,e){if(!So(t,e))return !1;if(t.name!==e.name||t.priority!==e.priority)return !1;for(const n of t.getAttributeKeys())if("class"!==n&&"style"!==n&&(!e.hasAttribute(n)||e.getAttribute(n)!==t.getAttribute(n)))return !1;if(!e.hasClass(...t.getClassNames()))return !1;for(const n of t.getStyleNames())if(!e.hasStyle(n)||e.getStyle(n)!==t.getStyle(n))return !1;for(const n of t.getAttributeKeys())"class"!==n&&"style"!==n&&this.removeAttribute(n,e);return this.removeClass(Array.from(t.getClassNames()),e),this.removeStyle(Array.from(t.getStyleNames()),e),!0}_breakAttributesRange(t,e=!1){const n=t.start,i=t.end;if(Mo(t),t.isCollapsed){const n=this._breakAttributes(t.start,e);return new Gi(n,n)}const o=this._breakAttributes(i,e),r=o.parent.childCount,s=this._breakAttributes(n,e);return o.offset+=o.parent.childCount-r,new Gi(s,o)}_breakAttributes(t,e=!1){const n=t.offset,i=t.parent;if(t.parent.is("emptyElement"))throw new P.b("view-writer-cannot-break-empty-element");if(t.parent.is("uiElement"))throw new P.b("view-writer-cannot-break-ui-element");if(!e&&i.is("text")&&Po(i.parent))return t.clone();if(Po(i))return t.clone();if(i.is("text"))return this._breakAttributes(Ao(t),e);if(n==i.childCount){const t=new $i(i.parent,i.index+1);return this._breakAttributes(t,e)}if(0===n){const t=new $i(i.parent,i.index);return this._breakAttributes(t,e)}{const t=i.index+1,o=i._clone();i.parent._insertChild(t,o),this._addToClonedElementsGroup(o);const r=i.childCount-n,s=i._removeChildren(n,r);o._appendChild(s);const a=new $i(i.parent,t);return this._breakAttributes(a,e)}}_addToClonedElementsGroup(t){if(!t.root.is("rootElement"))return;if(t.is("element"))for(const e of t.getChildren())this._addToClonedElementsGroup(e);const e=t.id;if(!e)return;let n=this._cloneGroups.get(e);n||(n=new Set,this._cloneGroups.set(e,n)),n.add(t),t._clonesGroup=n;}_removeFromClonedElementsGroup(t){if(t.is("element"))for(const e of t.getChildren())this._removeFromClonedElementsGroup(e);const e=t.id;if(!e)return;const n=this._cloneGroups.get(e);n&&n.delete(t);}}function vo(t){let e=t.parent;for(;!Po(e);){if(!e)return;e=e.parent;}return e}function yo(t,e){return t.priority<e.priority||!(t.priority>e.priority)&&t.getIdentity()<e.getIdentity()}function xo(t){const e=t.nodeBefore;if(e&&e.is("text"))return new $i(e,e.data.length);const n=t.nodeAfter;return n&&n.is("text")?new $i(n,0):t}function Ao(t){if(t.offset==t.parent.data.length)return new $i(t.parent.parent,t.parent.index+1);if(0===t.offset)return new $i(t.parent.parent,t.parent.index);const e=t.parent.data.slice(t.offset);return t.parent._data=t.parent.data.slice(0,t.offset),t.parent.parent._insertChild(t.parent.index+1,new ci(e)),new $i(t.parent.parent,t.parent.index+1)}function Co(t,e){const n=t.data.length;return t._data+=e.data,e._remove(),new $i(t,n)}const To=[ci,no,bi,ro,po];function Po(t){return t&&(t.is("containerElement")||t.is("documentFragment"))}function Mo(t){const e=vo(t.start),n=vo(t.end);if(!e||!n||e!==n)throw new P.b("view-writer-invalid-range-container")}function So(t,e){return null===t.id&&null===e.id}function Io(t){return "[object Text]"==Object.prototype.toString.call(t)}const Eo=t=>{const e=t.createElement("br");return e.dataset.ckeFiller=!0,e},No=t=>t.createTextNode(" "),Oo=7;let Ro="";for(let t=0;t<Oo;t++)Ro+="​";function Do(t){return Io(t)&&t.data.substr(0,Oo)===Ro}function Lo(t){return t.data.length==Oo&&Do(t)}function jo(t){return Do(t)?t.data.slice(Oo):t.data}const Vo=new WeakMap;function zo(t,e){let n=Vo.get(e);return n||(n=e(window.document),Vo.set(e,n)),t.isEqualNode(n)}function Bo(t,e){if(e.keyCode==ho.arrowleft){const t=e.domTarget.ownerDocument.defaultView.getSelection();if(1==t.rangeCount&&t.getRangeAt(0).collapsed){const e=t.getRangeAt(0).startContainer,n=t.getRangeAt(0).startOffset;Do(e)&&n<=Oo&&t.collapse(e,0);}}}function Fo(t,e,n){let i,o;if(n=n||function(t,e){return t===e},e.length<t.length){const n=t;t=e,e=n,i="delete",o="insert";}else i="insert",o="delete";const r=t.length,s=e.length,a=s-r,c={},l={};function d(a){const d=(void 0!==l[a-1]?l[a-1]:-1)+1,u=void 0!==l[a+1]?l[a+1]:-1,h=d>u?-1:1;c[a+h]&&(c[a]=c[a+h].slice(0)),c[a]||(c[a]=[]),c[a].push(d>u?i:o);let f=Math.max(d,u),m=f-a;for(;m<r&&f<s&&n(t[m],e[f]);)m++,f++,c[a].push("equal");return f}let u,h=0;do{for(u=-h;u<a;u++)l[u]=d(u);for(u=a+h;u>a;u--)l[u]=d(u);l[a]=d(a),h++;}while(l[a]!==s);return c[a].slice(1)}function Uo(t,e,n){t.insertBefore(n,t.childNodes[e]||null);}function Ho(t){const e=t.parentNode;e&&e.removeChild(t);}function qo(t){if(t){if(t.defaultView)return t instanceof t.defaultView.Document;if(t.ownerDocument&&t.ownerDocument.defaultView)return t instanceof t.ownerDocument.defaultView.Node}return !1}function Wo(t,e){if(t===e)return [];return function(t,e){const n=[],{firstIndex:i,lastIndexOld:o,lastIndexNew:r}=e;r-i>0&&n.push({index:i,type:"insert",values:t.substring(i,r).split("")});o-i>0&&n.push({index:i+(r-i),type:"delete",howMany:o-i});return n}(e,function(t,e){const n=Yo(t,e),i=$o(t,n),o=$o(e,n),r=Yo(i,o),s=t.length-r,a=e.length-r;return {firstIndex:n,lastIndexOld:s,lastIndexNew:a}}(t,e))}function Yo(t,e){for(let n=0;n<Math.max(t.length,e.length);n++)if(t[n]!==e[n])return n}function $o(t,e){return t.substring(e).split("").reverse().join("")}class Go{constructor(t,e){this.domDocuments=new Set,this.domConverter=t,this.markedAttributes=new Set,this.markedChildren=new Set,this.markedTexts=new Set,this.selection=e,this.isFocused=!1,this._inlineFiller=null,this._fakeSelectionContainer=null;}markToSync(t,e){if("text"===t)this.domConverter.mapViewToDom(e.parent)&&this.markedTexts.add(e);else{if(!this.domConverter.mapViewToDom(e))return;if("attributes"===t)this.markedAttributes.add(e);else{if("children"!==t)throw new P.b("view-renderer-unknown-type: Unknown type passed to Renderer.markToSync.");this.markedChildren.add(e);}}}render(){let t;for(const t of this.markedChildren)this._updateChildrenMappings(t);this._inlineFiller&&!this._isSelectionInInlineFiller()&&this._removeInlineFiller(),this._inlineFiller?t=this._getInlineFillerPosition():this._needsInlineFillerAtSelection()&&(t=this.selection.getFirstPosition(),this.markedChildren.add(t.parent));for(const t of this.markedAttributes)this._updateAttrs(t);for(const e of this.markedChildren)this._updateChildren(e,{inlineFillerPosition:t});for(const e of this.markedTexts)!this.markedChildren.has(e.parent)&&this.domConverter.mapViewToDom(e.parent)&&this._updateText(e,{inlineFillerPosition:t});if(t){const e=this.domConverter.viewPositionToDom(t),n=e.parent.ownerDocument;Do(e.parent)?this._inlineFiller=e.parent:this._inlineFiller=Qo(n,e.parent,e.offset);}else this._inlineFiller=null;this._updateSelection(),this._updateFocus(),this.markedTexts.clear(),this.markedAttributes.clear(),this.markedChildren.clear();}_updateChildrenMappings(t){const e=this.domConverter.mapViewToDom(t);if(!e)return;const n=this.domConverter.mapViewToDom(t).childNodes,i=Array.from(this.domConverter.viewChildrenToDom(t,e.ownerDocument,{withChildren:!1})),o=this._diffNodeLists(n,i),r=this._findReplaceActions(o,n,i);if(-1!==r.indexOf("replace")){const e={equal:0,insert:0,delete:0};for(const o of r)if("replace"===o){const o=e.equal+e.insert,r=e.equal+e.delete,s=t.getChild(o);s&&!s.is("uiElement")&&this._updateElementMappings(s,n[r]),Ho(i[o]),e.equal++;}else e[o]++;}}_updateElementMappings(t,e){this.domConverter.unbindDomElement(e),this.domConverter.bindElements(e,t),this.markedChildren.add(t),this.markedAttributes.add(t);}_getInlineFillerPosition(){const t=this.selection.getFirstPosition();return t.parent.is("text")?$i._createBefore(this.selection.getFirstPosition().parent):t}_isSelectionInInlineFiller(){if(1!=this.selection.rangeCount||!this.selection.isCollapsed)return !1;const t=this.selection.getFirstPosition(),e=this.domConverter.viewPositionToDom(t);return !!(e&&Io(e.parent)&&Do(e.parent))}_removeInlineFiller(){const t=this._inlineFiller;if(!Do(t))throw new P.b("view-renderer-filler-was-lost: The inline filler node was lost.");Lo(t)?t.parentNode.removeChild(t):t.data=t.data.substr(Oo),this._inlineFiller=null;}_needsInlineFillerAtSelection(){if(1!=this.selection.rangeCount||!this.selection.isCollapsed)return !1;const t=this.selection.getFirstPosition(),e=t.parent,n=t.offset;if(!this.domConverter.mapViewToDom(e.root))return !1;if(!e.is("element"))return !1;if(!function(t){if("false"==t.getAttribute("contenteditable"))return !1;const e=t.findAncestor(t=>t.hasAttribute("contenteditable"));return !e||"true"==e.getAttribute("contenteditable")}(e))return !1;if(n===e.getFillerOffset())return !1;const i=t.nodeBefore,o=t.nodeAfter;return !(i instanceof ci||o instanceof ci)}_updateText(t,e){const n=this.domConverter.findCorrespondingDomText(t),i=this.domConverter.viewToDom(t,n.ownerDocument),o=n.data;let r=i.data;const s=e.inlineFillerPosition;if(s&&s.parent==t.parent&&s.offset==t.index&&(r=Ro+r),o!=r){const t=Wo(o,r);for(const e of t)"insert"===e.type?n.insertData(e.index,e.values.join("")):n.deleteData(e.index,e.howMany);}}_updateAttrs(t){const e=this.domConverter.mapViewToDom(t);if(!e)return;const n=Array.from(e.attributes).map(t=>t.name),i=t.getAttributeKeys();for(const n of i)e.setAttribute(n,t.getAttribute(n));for(const i of n)t.hasAttribute(i)||e.removeAttribute(i);}_updateChildren(t,e){const n=this.domConverter.mapViewToDom(t);if(!n)return;const i=e.inlineFillerPosition,o=this.domConverter.mapViewToDom(t).childNodes,r=Array.from(this.domConverter.viewChildrenToDom(t,n.ownerDocument,{bind:!0,inlineFillerPosition:i}));i&&i.parent===t&&Qo(n.ownerDocument,r,i.offset);const s=this._diffNodeLists(o,r);let a=0;const c=new Set;for(const t of s)"insert"===t?(Uo(n,a,r[a]),a++):"delete"===t?(c.add(o[a]),Ho(o[a])):(this._markDescendantTextToSync(this.domConverter.domToView(r[a])),a++);for(const t of c)t.parentNode||this.domConverter.unbindDomElement(t);}_diffNodeLists(t,e){return Fo(t,e,function(t,e,n){if(e===n)return !0;if(Io(e)&&Io(n))return e.data===n.data;if(zo(e,t)&&zo(n,t))return !0;return !1}.bind(null,this.domConverter.blockFiller))}_findReplaceActions(t,e,n){if(-1===t.indexOf("insert")||-1===t.indexOf("delete"))return t;let i=[],o=[],r=[];const s={equal:0,insert:0,delete:0};for(const a of t)"insert"===a?r.push(n[s.equal+s.insert]):"delete"===a?o.push(e[s.equal+s.delete]):((i=i.concat(Fo(o,r,Ko).map(t=>"equal"===t?"replace":t))).push("equal"),o=[],r=[]),s[a]++;return i.concat(Fo(o,r,Ko).map(t=>"equal"===t?"replace":t))}_markDescendantTextToSync(t){if(t)if(t.is("text"))this.markedTexts.add(t);else if(t.is("element"))for(const e of t.getChildren())this._markDescendantTextToSync(e);}_updateSelection(){if(0===this.selection.rangeCount)return this._removeDomSelection(),void this._removeFakeSelection();const t=this.domConverter.mapViewToDom(this.selection.editableElement);this.isFocused&&t&&(this.selection.isFake?this._updateFakeSelection(t):(this._removeFakeSelection(),this._updateDomSelection(t)));}_updateFakeSelection(t){const e=t.ownerDocument;let n=this._fakeSelectionContainer;n||(this._fakeSelectionContainer=n=e.createElement("div"),Object.assign(n.style,{position:"fixed",top:0,left:"-9999px",width:"42px"}),n.appendChild(e.createTextNode(" "))),n.parentElement||t.appendChild(n),n.firstChild.data=this.selection.fakeSelectionLabel||" ";const i=e.getSelection(),o=e.createRange();i.removeAllRanges(),o.selectNodeContents(n),i.addRange(o),this.domConverter.bindFakeSelection(n,this.selection);}_updateDomSelection(t){const e=t.ownerDocument.defaultView.getSelection();if(!this._domSelectionNeedsUpdate(e))return;const n=this.domConverter.viewPositionToDom(this.selection.anchor),i=this.domConverter.viewPositionToDom(this.selection.focus);t.focus(),e.collapse(n.parent,n.offset),e.extend(i.parent,i.offset),co.isGecko&&function(t,e){const n=t.parent;if(n.nodeType!=Node.ELEMENT_NODE||t.offset!=n.childNodes.length-1)return;const i=n.childNodes[t.offset];i&&"BR"==i.tagName&&e.addRange(e.getRangeAt(0));}(i,e);}_domSelectionNeedsUpdate(t){if(!this.domConverter.isDomSelectionCorrect(t))return !0;const e=t&&this.domConverter.domSelectionToView(t);return (!e||!this.selection.isEqual(e))&&!(!this.selection.isCollapsed&&this.selection.isSimilar(e))}_removeDomSelection(){for(const t of this.domDocuments){if(t.getSelection().rangeCount){const e=t.activeElement,n=this.domConverter.mapDomToView(e);e&&n&&t.getSelection().removeAllRanges();}}}_removeFakeSelection(){const t=this._fakeSelectionContainer;t&&t.remove();}_updateFocus(){if(this.isFocused){const t=this.selection.editableElement;t&&this.domConverter.focus(t);}}}function Qo(t,e,n){const i=e instanceof Array?e:e.childNodes,o=i[n];if(Io(o))return o.data=Ro+o.data,o;{const o=t.createTextNode(Ro);return Array.isArray(e)?i.splice(n,0,o):Uo(e,n,o),o}}function Ko(t,e){return qo(t)&&qo(e)&&!Io(t)&&!Io(e)&&t.tagName.toLowerCase()===e.tagName.toLowerCase()}F(Go,Li);var Jo={window:window,document:document};function Zo(t){let e=0;for(;t.previousSibling;)t=t.previousSibling,e++;return e}function Xo(t){const e=[];for(;t&&t.nodeType!=Node.DOCUMENT_NODE;)e.unshift(t),t=t.parentNode;return e}var tr=function(t){return w(t)&&1===t.nodeType&&!C(t)};class er{constructor(t={}){this.blockFiller=t.blockFiller||Eo,this.preElements=["pre"],this.blockElements=["p","div","h1","h2","h3","h4","h5","h6"],this._domToViewMapping=new WeakMap,this._viewToDomMapping=new WeakMap,this._fakeSelectionMapping=new WeakMap;}bindFakeSelection(t,e){this._fakeSelectionMapping.set(t,new Ji(e));}fakeSelectionToView(t){return this._fakeSelectionMapping.get(t)}bindElements(t,e){this._domToViewMapping.set(t,e),this._viewToDomMapping.set(e,t);}unbindDomElement(t){const e=this._domToViewMapping.get(t);if(e){this._domToViewMapping.delete(t),this._viewToDomMapping.delete(e);for(const e of Array.from(t.childNodes))this.unbindDomElement(e);}}bindDocumentFragments(t,e){this._domToViewMapping.set(t,e),this._viewToDomMapping.set(e,t);}viewToDom(t,e,n={}){if(t.is("text")){const n=this._processDataFromViewText(t);return e.createTextNode(n)}{if(this.mapViewToDom(t))return this.mapViewToDom(t);let i;if(t.is("documentFragment"))i=e.createDocumentFragment(),n.bind&&this.bindDocumentFragments(i,t);else{if(t.is("uiElement"))return i=t.render(e),n.bind&&this.bindElements(i,t),i;i=e.createElement(t.name),n.bind&&this.bindElements(i,t);for(const e of t.getAttributeKeys())i.setAttribute(e,t.getAttribute(e));}if(n.withChildren||void 0===n.withChildren)for(const o of this.viewChildrenToDom(t,e,n))i.appendChild(o);return i}}*viewChildrenToDom(t,e,n={}){const i=t.getFillerOffset&&t.getFillerOffset();let o=0;for(const r of t.getChildren())i===o&&(yield this.blockFiller(e)),yield this.viewToDom(r,e,n),o++;i===o&&(yield this.blockFiller(e));}viewRangeToDom(t){const e=this.viewPositionToDom(t.start),n=this.viewPositionToDom(t.end),i=document.createRange();return i.setStart(e.parent,e.offset),i.setEnd(n.parent,n.offset),i}viewPositionToDom(t){const e=t.parent;if(e.is("text")){const n=this.findCorrespondingDomText(e);if(!n)return null;let i=t.offset;return Do(n)&&(i+=Oo),{parent:n,offset:i}}{let n,i,o;if(0===t.offset){if(!(n=this.mapViewToDom(e)))return null;o=n.childNodes[0];}else{const e=t.nodeBefore;if(!(i=e.is("text")?this.findCorrespondingDomText(e):this.mapViewToDom(t.nodeBefore)))return null;n=i.parentNode,o=i.nextSibling;}if(Io(o)&&Do(o))return {parent:o,offset:Oo};return {parent:n,offset:i?Zo(i)+1:0}}}domToView(t,e={}){if(zo(t,this.blockFiller))return null;const n=this.getParentUIElement(t,this._domToViewMapping);if(n)return n;if(Io(t)){if(Lo(t))return null;{const e=this._processDataFromDomText(t);return ""===e?null:new ci(e)}}if(this.isComment(t))return null;{if(this.mapDomToView(t))return this.mapDomToView(t);let n;if(this.isDocumentFragment(t))n=new _o,e.bind&&this.bindDocumentFragments(t,n);else{const i=e.keepOriginalCase?t.tagName:t.tagName.toLowerCase();n=new mi(i),e.bind&&this.bindElements(t,n);const o=t.attributes;for(let t=o.length-1;t>=0;t--)n._setAttribute(o[t].name,o[t].value);}if(e.withChildren||void 0===e.withChildren)for(const i of this.domChildrenToView(t,e))n._appendChild(i);return n}}*domChildrenToView(t,e={}){for(let n=0;n<t.childNodes.length;n++){const i=t.childNodes[n],o=this.domToView(i,e);null!==o&&(yield o);}}domSelectionToView(t){if(1===t.rangeCount){let e=t.getRangeAt(0).startContainer;Io(e)&&(e=e.parentNode);const n=this.fakeSelectionToView(e);if(n)return n}const e=this.isDomSelectionBackward(t),n=[];for(let e=0;e<t.rangeCount;e++){const i=t.getRangeAt(e),o=this.domRangeToView(i);o&&n.push(o);}return new Ji(n,{backward:e})}domRangeToView(t){const e=this.domPositionToView(t.startContainer,t.startOffset),n=this.domPositionToView(t.endContainer,t.endOffset);return e&&n?new Gi(e,n):null}domPositionToView(t,e){if(zo(t,this.blockFiller))return this.domPositionToView(t.parentNode,Zo(t));const n=this.mapDomToView(t);if(n&&n.is("uiElement"))return $i._createBefore(n);if(Io(t)){if(Lo(t))return this.domPositionToView(t.parentNode,Zo(t));const n=this.findCorrespondingViewText(t);let i=e;return n?(Do(t)&&(i=(i-=Oo)<0?0:i),new $i(n,i)):null}if(0===e){const e=this.mapDomToView(t);if(e)return new $i(e,0)}else{const n=t.childNodes[e-1],i=Io(n)?this.findCorrespondingViewText(n):this.mapDomToView(n);if(i&&i.parent)return new $i(i.parent,i.index+1)}return null}mapDomToView(t){return this.getParentUIElement(t)||this._domToViewMapping.get(t)}findCorrespondingViewText(t){if(Lo(t))return null;const e=this.getParentUIElement(t);if(e)return e;const n=t.previousSibling;if(n){if(!this.isElement(n))return null;const t=this.mapDomToView(n);if(t){return t.nextSibling instanceof ci?t.nextSibling:null}}else{const e=this.mapDomToView(t.parentNode);if(e){const t=e.getChild(0);return t instanceof ci?t:null}}return null}mapViewToDom(t){return this._viewToDomMapping.get(t)}findCorrespondingDomText(t){const e=t.previousSibling;return e&&this.mapViewToDom(e)?this.mapViewToDom(e).nextSibling:!e&&t.parent&&this.mapViewToDom(t.parent)?this.mapViewToDom(t.parent).childNodes[0]:null}focus(t){const e=this.mapViewToDom(t);if(e&&e.ownerDocument.activeElement!==e){const{scrollX:t,scrollY:n}=Jo.window,i=[];ir(e,t=>{const{scrollLeft:e,scrollTop:n}=t;i.push([e,n]);}),e.focus(),ir(e,t=>{const[e,n]=i.shift();t.scrollLeft=e,t.scrollTop=n;}),Jo.window.scrollTo(t,n);}}isElement(t){return t&&t.nodeType==Node.ELEMENT_NODE}isDocumentFragment(t){return t&&t.nodeType==Node.DOCUMENT_FRAGMENT_NODE}isComment(t){return t&&t.nodeType==Node.COMMENT_NODE}isDomSelectionBackward(t){if(t.isCollapsed)return !1;const e=document.createRange();e.setStart(t.anchorNode,t.anchorOffset),e.setEnd(t.focusNode,t.focusOffset);const n=e.collapsed;return e.detach(),n}getParentUIElement(t){const e=Xo(t);for(e.pop();e.length;){const t=e.pop(),n=this._domToViewMapping.get(t);if(n&&n.is("uiElement"))return n}return null}isDomSelectionCorrect(t){return this._isDomSelectionPositionCorrect(t.anchorNode,t.anchorOffset)&&this._isDomSelectionPositionCorrect(t.focusNode,t.focusOffset)}_isDomSelectionPositionCorrect(t,e){if(Io(t)&&Do(t)&&e<Oo)return !1;if(this.isElement(t)&&Do(t.childNodes[e]))return !1;const n=this.mapDomToView(t);return !n||!n.is("uiElement")}_processDataFromViewText(t){let e=t.data;if(t.getAncestors().some(t=>this.preElements.includes(t.name)))return e;if(" "==e.charAt(0)){const n=this._getTouchingViewTextNode(t,!1);!(n&&this._nodeEndsWithSpace(n))&&n||(e=" "+e.substr(1));}if(" "==e.charAt(e.length-1)){this._getTouchingViewTextNode(t,!0)||(e=e.substr(0,e.length-1)+" ");}return e.replace(/ {2}/g,"  ")}_nodeEndsWithSpace(t){if(t.getAncestors().some(t=>this.preElements.includes(t.name)))return !1;const e=this._processDataFromViewText(t);return " "==e.charAt(e.length-1)}_processDataFromDomText(t){let e=t.data;if(nr(t,this.preElements))return jo(t);e=e.replace(/[ \n\t\r]{1,}/g," ");const n=this._getTouchingInlineDomNode(t,!1),i=this._getTouchingInlineDomNode(t,!0),o=this._checkShouldLeftTrimDomText(n),r=this._checkShouldRightTrimDomText(t,i);return o&&(e=e.replace(/^ /,"")),r&&(e=e.replace(/ $/,"")),e=(e=jo(new Text(e))).replace(/ \u00A0/g,"  "),o&&(e=e.replace(/^\u00A0/," ")),Io(i)&&" "!=i.data.charAt(0)||(e=e.replace(/\u00A0( *)$/," $1")),e}_checkShouldLeftTrimDomText(t){return !t||(!!tr(t)||/[^\S\u00A0]/.test(t.data.charAt(t.data.length-1)))}_checkShouldRightTrimDomText(t,e){return !e&&!Do(t)}_getTouchingViewTextNode(t,e){const n=new Yi({startPosition:e?$i._createAfter(t):$i._createBefore(t),direction:e?"forward":"backward"});for(const t of n){if(t.item.is("containerElement"))return null;if(t.item.is("br"))return null;if(t.item.is("textProxy"))return t.item}return null}_getTouchingInlineDomNode(t,e){if(!t.parentNode)return null;const n=e?"nextNode":"previousNode",i=t.ownerDocument,o=Xo(t)[0],r=i.createTreeWalker(o,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT,{acceptNode:t=>Io(t)?NodeFilter.FILTER_ACCEPT:"BR"==t.tagName?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP});r.currentNode=t;const s=r[n]();if(null!==s){const e=function(t,e){const n=Xo(t),i=Xo(e);let o=0;for(;n[o]==i[o]&&n[o];)o++;return 0===o?null:n[o-1]}(t,s);if(e&&!nr(t,this.blockElements,e)&&!nr(s,this.blockElements,e))return s}return null}}function nr(t,e,n){let i=Xo(t);return n&&(i=i.slice(i.indexOf(n)+1)),i.some(t=>t.tagName&&e.includes(t.tagName.toLowerCase()))}function ir(t,e){for(;t&&t!=Jo.document;)e(t),t=t.parentNode;}function or(t){const e=Object.prototype.toString.apply(t);return "[object Window]"==e||"[object global]"==e}var rr=Ei({},R,{listenTo(t,...e){if(qo(t)||or(t)){const n=this._getProxyEmitter(t)||new sr(t);n.attach(...e),t=n;}R.listenTo.call(this,t,...e);},stopListening(t,e,n){if(qo(t)||or(t)){const e=this._getProxyEmitter(t);if(!e)return;t=e;}R.stopListening.call(this,t,e,n),t instanceof sr&&t.detach(e);},_getProxyEmitter(t){return function(t,e){return t[N]&&t[N][e]?t[N][e].emitter:null}(this,ar(t))}});class sr{constructor(t){D(this,ar(t)),this._domNode=t;}}function ar(t){return t["data-ck-expando"]||(t["data-ck-expando"]=I())}Ei(sr.prototype,R,{attach(t,e,n={}){if(this._domListeners&&this._domListeners[t])return;const i=this._createDomListener(t,!!n.useCapture);this._domNode.addEventListener(t,i,!!n.useCapture),this._domListeners||(this._domListeners={}),this._domListeners[t]=i;},detach(t){let e;!this._domListeners[t]||(e=this._events[t])&&e.callbacks.length||this._domListeners[t].removeListener();},_createDomListener(t,e){const n=e=>{this.fire(t,e);};return n.removeListener=(()=>{this._domNode.removeEventListener(t,n,e),delete this._domListeners[t];}),n}});class cr{constructor(t){this.view=t,this.document=t.document,this.isEnabled=!1;}enable(){this.isEnabled=!0;}disable(){this.isEnabled=!1;}destroy(){this.disable(),this.stopListening();}}F(cr,rr);var lr="__lodash_hash_undefined__";var dr=function(t){return this.__data__.set(t,lr),this};var ur=function(t){return this.__data__.has(t)};function hr(t){var e=-1,n=null==t?0:t.length;for(this.__data__=new qt;++e<n;)this.add(t[e]);}hr.prototype.add=hr.prototype.push=dr,hr.prototype.has=ur;var fr=hr;var mr=function(t,e){for(var n=-1,i=null==t?0:t.length;++n<i;)if(e(t[n],n,t))return !0;return !1};var gr=function(t,e){return t.has(e)},pr=1,br=2;var wr=function(t,e,n,i,o,r){var s=n&pr,a=t.length,c=e.length;if(a!=c&&!(s&&c>a))return !1;var l=r.get(t);if(l&&r.get(e))return l==e;var d=-1,u=!0,h=n&br?new fr:void 0;for(r.set(t,e),r.set(e,t);++d<a;){var f=t[d],m=e[d];if(i)var g=s?i(m,f,d,e,t,r):i(f,m,d,t,e,r);if(void 0!==g){if(g)continue;u=!1;break}if(h){if(!mr(e,function(t,e){if(!gr(h,e)&&(f===t||o(f,t,n,i,r)))return h.push(e)})){u=!1;break}}else if(f!==m&&!o(f,m,n,i,r)){u=!1;break}}return r.delete(t),r.delete(e),u};var _r=function(t){var e=-1,n=Array(t.size);return t.forEach(function(t,i){n[++e]=[i,t];}),n};var kr=function(t){var e=-1,n=Array(t.size);return t.forEach(function(t){n[++e]=t;}),n},vr=1,yr=2,xr="[object Boolean]",Ar="[object Date]",Cr="[object Error]",Tr="[object Map]",Pr="[object Number]",Mr="[object RegExp]",Sr="[object Set]",Ir="[object String]",Er="[object Symbol]",Nr="[object ArrayBuffer]",Or="[object DataView]",Rr=o?o.prototype:void 0,Dr=Rr?Rr.valueOf:void 0;var Lr=function(t,e,n,i,o,r,s){switch(n){case Or:if(t.byteLength!=e.byteLength||t.byteOffset!=e.byteOffset)return !1;t=t.buffer,e=e.buffer;case Nr:return !(t.byteLength!=e.byteLength||!r(new dn(t),new dn(e)));case xr:case Ar:case Pr:return q(+t,+e);case Cr:return t.name==e.name&&t.message==e.message;case Mr:case Ir:return t==e+"";case Tr:var a=_r;case Sr:var c=i&vr;if(a||(a=kr),t.size!=e.size&&!c)return !1;var l=s.get(t);if(l)return l==e;i|=yr,s.set(t,e);var d=wr(a(t),a(e),i,o,r,s);return s.delete(t),d;case Er:if(Dr)return Dr.call(t)==Dr.call(e)}return !1},jr=1,Vr=Object.prototype.hasOwnProperty;var zr=function(t,e,n,i,o,r){var s=n&jr,a=Ge(t),c=a.length;if(c!=Ge(e).length&&!s)return !1;for(var l=c;l--;){var d=a[l];if(!(s?d in e:Vr.call(e,d)))return !1}var u=r.get(t);if(u&&r.get(e))return u==e;var h=!0;r.set(t,e),r.set(e,t);for(var f=s;++l<c;){var m=t[d=a[l]],g=e[d];if(i)var p=s?i(g,m,d,e,t,r):i(m,g,d,t,e,r);if(!(void 0===p?m===g||o(m,g,n,i,r):p)){h=!1;break}f||(f="constructor"==d);}if(h&&!f){var b=t.constructor,w=e.constructor;b!=w&&"constructor"in t&&"constructor"in e&&!("function"==typeof b&&b instanceof b&&"function"==typeof w&&w instanceof w)&&(h=!1);}return r.delete(t),r.delete(e),h},Br=1,Fr="[object Arguments]",Ur="[object Array]",Hr="[object Object]",qr=Object.prototype.hasOwnProperty;var Wr=function(t,e,n,i,o,r){var s=ce(t),a=ce(e),c=s?Ur:an(t),l=a?Ur:an(e),d=(c=c==Fr?Hr:c)==Hr,u=(l=l==Fr?Hr:l)==Hr,h=c==l;if(h&&Object(le.a)(t)){if(!Object(le.a)(e))return !1;s=!0,d=!1;}if(h&&!d)return r||(r=new Gt),s||ke(t)?wr(t,e,n,i,o,r):Lr(t,e,c,n,i,o,r);if(!(n&Br)){var f=d&&qr.call(t,"__wrapped__"),m=u&&qr.call(e,"__wrapped__");if(f||m){var g=f?t.value():t,p=m?e.value():e;return r||(r=new Gt),o(g,p,n,i,r)}}return !!h&&(r||(r=new Gt),zr(t,e,n,i,o,r))};var Yr=function t(e,n,i,o,r){return e===n||(null==e||null==n||!w(e)&&!w(n)?e!=e&&n!=n:Wr(e,n,i,o,t,r))};var $r=function(t,e,n){var i=(n="function"==typeof n?n:void 0)?n(t,e):void 0;return void 0===i?Yr(t,e,void 0,n):!!i};class Gr extends cr{constructor(t){super(t),this._config={childList:!0,characterData:!0,characterDataOldValue:!0,subtree:!0},this.domConverter=t.domConverter,this.renderer=t._renderer,this._domElements=[],this._mutationObserver=new window.MutationObserver(this._onMutations.bind(this));}flush(){this._onMutations(this._mutationObserver.takeRecords());}observe(t){this._domElements.push(t),this.isEnabled&&this._mutationObserver.observe(t,this._config);}enable(){super.enable();for(const t of this._domElements)this._mutationObserver.observe(t,this._config);}disable(){super.disable(),this._mutationObserver.disconnect();}destroy(){super.destroy(),this._mutationObserver.disconnect();}_onMutations(t){if(0===t.length)return;const e=this.domConverter,n=new Map,i=new Set;for(const n of t)if("childList"===n.type){const t=e.mapDomToView(n.target);if(t&&t.is("uiElement"))continue;t&&!this._isBogusBrMutation(n)&&i.add(t);}for(const o of t){const t=e.mapDomToView(o.target);if((!t||!t.is("uiElement"))&&"characterData"===o.type){const t=e.findCorrespondingViewText(o.target);t&&!i.has(t.parent)?n.set(t,{type:"text",oldText:t.data,newText:jo(o.target),node:t}):!t&&Do(o.target)&&i.add(e.mapDomToView(o.target.parentNode));}}const o=[];for(const t of n.values())this.renderer.markToSync("text",t.node),o.push(t);for(const t of i){const n=e.mapViewToDom(t),i=Array.from(t.getChildren()),r=Array.from(e.domChildrenToView(n,{withChildren:!1}));$r(i,r,a)||(this.renderer.markToSync("children",t),o.push({type:"children",oldChildren:i,newChildren:r,node:t}));}const r=t[0].target.ownerDocument.getSelection();let s=null;if(r&&r.anchorNode){const t=e.domPositionToView(r.anchorNode,r.anchorOffset),n=e.domPositionToView(r.focusNode,r.focusOffset);t&&n&&(s=new Ji(t)).setFocus(n);}function a(t,e){if(!Array.isArray(t))return t===e||!(!t.is("text")||!e.is("text"))&&t.data===e.data}this.document.fire("mutations",o,s),this.view.render();}_isBogusBrMutation(t){let e=null;return null===t.nextSibling&&0===t.removedNodes.length&&1==t.addedNodes.length&&(e=this.domConverter.domToView(t.addedNodes[0],{withChildren:!1})),e&&e.is("element","br")}}class Qr{constructor(t,e,n){this.view=t,this.document=t.document,this.domEvent=e,this.domTarget=e.target,Ei(this,n);}get target(){return this.view.domConverter.mapDomToView(this.domTarget)}preventDefault(){this.domEvent.preventDefault();}stopPropagation(){this.domEvent.stopPropagation();}}class Kr extends cr{constructor(t){super(t),this.useCapture=!1;}observe(t){("string"==typeof this.domEventType?[this.domEventType]:this.domEventType).forEach(e=>{this.listenTo(t,e,(t,e)=>{this.isEnabled&&this.onDomEvent(e);},{useCapture:this.useCapture});});}fire(t,e,n){this.isEnabled&&this.document.fire(t,new Qr(this.view,e,n));}}class Jr extends Kr{constructor(t){super(t),this.domEventType=["keydown","keyup"];}onDomEvent(t){this.fire(t.type,t,{keyCode:t.keyCode,altKey:t.altKey,ctrlKey:t.ctrlKey||t.metaKey,shiftKey:t.shiftKey,get keystroke(){return fo(this)}});}}var Zr=function(){return i.a.Date.now()},Xr="[object Symbol]";var ts=function(t){return "symbol"==typeof t||w(t)&&g(t)==Xr},es=NaN,ns=/^\s+|\s+$/g,is=/^[-+]0x[0-9a-f]+$/i,os=/^0b[01]+$/i,rs=/^0o[0-7]+$/i,ss=parseInt;var as=function(t){if("number"==typeof t)return t;if(ts(t))return es;if(it(t)){var e="function"==typeof t.valueOf?t.valueOf():t;t=it(e)?e+"":e;}if("string"!=typeof t)return 0===t?t:+t;t=t.replace(ns,"");var n=os.test(t);return n||rs.test(t)?ss(t.slice(2),n?2:8):is.test(t)?es:+t},cs="Expected a function",ls=Math.max,ds=Math.min;var us=function(t,e,n){var i,o,r,s,a,c,l=0,d=!1,u=!1,h=!0;if("function"!=typeof t)throw new TypeError(cs);function f(e){var n=i,r=o;return i=o=void 0,l=e,s=t.apply(r,n)}function m(t){var n=t-c;return void 0===c||n>=e||n<0||u&&t-l>=r}function g(){var t=Zr();if(m(t))return p(t);a=setTimeout(g,function(t){var n=e-(t-c);return u?ds(n,r-(t-l)):n}(t));}function p(t){return a=void 0,h&&i?f(t):(i=o=void 0,s)}function b(){var t=Zr(),n=m(t);if(i=arguments,o=this,c=t,n){if(void 0===a)return function(t){return l=t,a=setTimeout(g,e),d?f(t):s}(c);if(u)return a=setTimeout(g,e),f(c)}return void 0===a&&(a=setTimeout(g,e)),s}return e=as(e)||0,it(n)&&(d=!!n.leading,r=(u="maxWait"in n)?ls(as(n.maxWait)||0,e):r,h="trailing"in n?!!n.trailing:h),b.cancel=function(){void 0!==a&&clearTimeout(a),l=0,i=c=o=a=void 0;},b.flush=function(){return void 0===a?s:p(Zr())},b};class hs extends cr{constructor(t){super(t),this._fireSelectionChangeDoneDebounced=us(t=>this.document.fire("selectionChangeDone",t),200);}observe(){const t=this.document;t.on("keydown",(e,n)=>{t.selection.isFake&&function(t){return t==ho.arrowright||t==ho.arrowleft||t==ho.arrowup||t==ho.arrowdown}(n.keyCode)&&this.isEnabled&&(n.preventDefault(),this._handleSelectionMove(n.keyCode));},{priority:"lowest"});}destroy(){super.destroy(),this._fireSelectionChangeDoneDebounced.cancel();}_handleSelectionMove(t){const e=this.document.selection,n=new Ji(e.getRanges(),{backward:e.isBackward,fake:!1});t!=ho.arrowleft&&t!=ho.arrowup||n.setTo(n.getFirstPosition()),t!=ho.arrowright&&t!=ho.arrowdown||n.setTo(n.getLastPosition());const i={oldSelection:e,newSelection:n,domSelection:null};this.document.fire("selectionChange",i),this._fireSelectionChangeDoneDebounced(i);}}var fs=n(1);class ms extends cr{constructor(t){super(t),this.mutationObserver=t.getObserver(Gr),this.selection=this.document.selection,this.domConverter=t.domConverter,this._documents=new WeakSet,this._fireSelectionChangeDoneDebounced=us(t=>this.document.fire("selectionChangeDone",t),200),this._clearInfiniteLoopInterval=setInterval(()=>this._clearInfiniteLoop(),1e3),this._loopbackCounter=0;}observe(t){const e=t.ownerDocument;this._documents.has(e)||(this.listenTo(e,"selectionchange",()=>{this._handleSelectionChange(e);}),this._documents.add(e));}destroy(){super.destroy(),clearInterval(this._clearInfiniteLoopInterval),this._fireSelectionChangeDoneDebounced.cancel();}_handleSelectionChange(t){if(!this.isEnabled||!this.document.isFocused&&!this.document.isReadOnly)return;this.mutationObserver.flush();const e=t.defaultView.getSelection(),n=this.domConverter.domSelectionToView(e);if(!this.selection.isEqual(n)||!this.domConverter.isDomSelectionCorrect(e))if(++this._loopbackCounter>60)fs.a.warn("selectionchange-infinite-loop: Selection change observer detected an infinite rendering loop.");else if(this.selection.isSimilar(n))this.view.render();else{const t={oldSelection:this.selection,newSelection:n,domSelection:e};this.document.fire("selectionChange",t),this._fireSelectionChangeDoneDebounced(t);}}_clearInfiniteLoop(){this._loopbackCounter=0;}}class gs extends Kr{constructor(t){super(t),this.domEventType=["focus","blur"],this.useCapture=!0;const e=this.document;e.on("focus",()=>{e.isFocused=!0,this._renderTimeoutId=setTimeout(()=>t.render(),50);}),e.on("blur",(n,i)=>{const o=e.selection.editableElement;null!==o&&o!==i.target||(e.isFocused=!1,t.render());});}onDomEvent(t){this.fire(t.type,t);}destroy(){this._renderTimeoutId&&clearTimeout(this._renderTimeoutId),super.destroy();}}class ps extends Kr{constructor(t){super(t),this.domEventType=["compositionstart","compositionupdate","compositionend"];const e=this.document;e.on("compositionstart",()=>{e.isComposing=!0;}),e.on("compositionend",()=>{e.isComposing=!1;});}onDomEvent(t){this.fire(t.type,t);}}function bs(t){return "[object Range]"==Object.prototype.toString.apply(t)}function ws(t){const e=t.ownerDocument.defaultView.getComputedStyle(t);return {top:parseInt(e.borderTopWidth,10),right:parseInt(e.borderRightWidth,10),bottom:parseInt(e.borderBottomWidth,10),left:parseInt(e.borderLeftWidth,10)}}const _s=["top","right","bottom","left","width","height"];class ks{constructor(t){const e=bs(t);if(Object.defineProperty(this,"_source",{value:t._source||t,writable:!0,enumerable:!1}),tr(t)||e){const n=e?t.startContainer:t;n.ownerDocument&&n.ownerDocument.body.contains(n)||fs.a.warn("rect-source-not-in-dom: The source of this rect does not belong to any rendered DOM tree.",{source:t}),vs(this,e?ks.getDomRangeRects(t)[0]:t.getBoundingClientRect());}else if(or(t)){const{innerWidth:e,innerHeight:n}=t;vs(this,{top:0,right:e,bottom:n,left:0,width:e,height:n});}else vs(this,t);}clone(){return new ks(this)}moveTo(t,e){return this.top=e,this.right=t+this.width,this.bottom=e+this.height,this.left=t,this}moveBy(t,e){return this.top+=e,this.right+=t,this.left+=t,this.bottom+=e,this}getIntersection(t){const e={top:Math.max(this.top,t.top),right:Math.min(this.right,t.right),bottom:Math.min(this.bottom,t.bottom),left:Math.max(this.left,t.left)};return e.width=e.right-e.left,e.height=e.bottom-e.top,e.width<0||e.height<0?null:new ks(e)}getIntersectionArea(t){const e=this.getIntersection(t);return e?e.getArea():0}getArea(){return this.width*this.height}getVisible(){const t=this._source;let e=this.clone();if(!ys(t)){let n=t.parentNode||t.commonAncestorContainer;for(;n&&!ys(n);){const t=new ks(n),i=e.getIntersection(t);if(!i)return null;i.getArea()<e.getArea()&&(e=i),n=n.parentNode;}}return e}isEqual(t){for(const e of _s)if(this[e]!==t[e])return !1;return !0}contains(t){const e=this.getIntersection(t);return !(!e||!e.isEqual(t))}excludeScrollbarsAndBorders(){const t=this._source;let e,n;if(or(t))e=t.innerWidth-t.document.documentElement.clientWidth,n=t.innerHeight-t.document.documentElement.clientHeight;else{const i=ws(this._source);e=t.offsetWidth-t.clientWidth,n=t.offsetHeight-t.clientHeight,this.moveBy(i.left,i.top);}return this.width-=e,this.right-=e,this.height-=n,this.bottom-=n,this}static getDomRangeRects(t){const e=[],n=Array.from(t.getClientRects());if(n.length)for(const t of n)e.push(new ks(t));else{let n=t.startContainer;Io(n)&&(n=n.parentNode);const i=new ks(n.getBoundingClientRect());i.right=i.left,i.width=0,e.push(i);}return e}}function vs(t,e){for(const n of _s)t[n]=e[n];}function ys(t){return !!tr(t)&&t===t.ownerDocument.body}function xs({target:t,viewportOffset:e=0}){const n=Is(t);let i=n,o=null;for(;i;){let r;Cs(r=Es(i==n?t:o),()=>Ns(t,i));const s=Ns(t,i);if(As(i,s,e),i.parent!=i){if(o=i.frameElement,i=i.parent,!o)return}else i=null;}}function As(t,e,n){const i=e.clone().moveBy(0,n),o=e.clone().moveBy(0,-n),r=new ks(t).excludeScrollbarsAndBorders();if(![o,i].every(t=>r.contains(t))){let{scrollX:s,scrollY:a}=t;Ps(o,r)?a-=r.top-e.top+n:Ts(i,r)&&(a+=e.bottom-r.bottom+n),Ms(e,r)?s-=r.left-e.left+n:Ss(e,r)&&(s+=e.right-r.right+n),t.scrollTo(s,a);}}function Cs(t,e){const n=Is(t);let i,o;for(;t!=n.document.body;)o=e(),(i=new ks(t).excludeScrollbarsAndBorders()).contains(o)||(Ps(o,i)?t.scrollTop-=i.top-o.top:Ts(o,i)&&(t.scrollTop+=o.bottom-i.bottom),Ms(o,i)?t.scrollLeft-=i.left-o.left:Ss(o,i)&&(t.scrollLeft+=o.right-i.right)),t=t.parentNode;}function Ts(t,e){return t.bottom>e.bottom}function Ps(t,e){return t.top<e.top}function Ms(t,e){return t.left<e.left}function Ss(t,e){return t.right>e.right}function Is(t){return bs(t)?t.startContainer.ownerDocument.defaultView:t.ownerDocument.defaultView}function Es(t){if(bs(t)){let e=t.commonAncestorContainer;return Io(e)&&(e=e.parentNode),e}return t.parentNode}function Ns(t,e){const n=Is(t),i=new ks(t);if(n===e)return i;{let t=n;for(;t!=e;){const e=t.frameElement,n=new ks(e).excludeScrollbarsAndBorders();i.moveBy(n.left,n.top),t=t.parent;}}return i}Object.assign({},{scrollViewportToShowTarget:xs,scrollAncestorsToShowTarget:function(t){Cs(Es(t),()=>new ks(t));}});class Os{constructor(){this.document=new to,this.domConverter=new er,this._renderer=new Go(this.domConverter,this.document.selection),this._renderer.bind("isFocused").to(this.document),this.domRoots=new Map,this._observers=new Map,this._ongoingChange=!1,this._renderingInProgress=!1,this._postFixersInProgress=!1,this._renderingDisabled=!1,this._writer=new ko(this.document),this.addObserver(Gr),this.addObserver(ms),this.addObserver(gs),this.addObserver(Jr),this.addObserver(hs),this.addObserver(ps),function(t){t.document.on("keydown",Bo);}(this),bo(this),this.on("render",()=>{this._render(),this.document.fire("layoutChanged");});}attachDomRoot(t,e="main"){const n=this.document.getRoot(e);n._name=t.tagName.toLowerCase(),this.domRoots.set(e,t),this.domConverter.bindElements(t,n),this._renderer.markToSync("children",n),this._renderer.domDocuments.add(t.ownerDocument),n.on("change:children",(t,e)=>this._renderer.markToSync("children",e)),n.on("change:attributes",(t,e)=>this._renderer.markToSync("attributes",e)),n.on("change:text",(t,e)=>this._renderer.markToSync("text",e));for(const n of this._observers.values())n.observe(t,e);}getDomRoot(t="main"){return this.domRoots.get(t)}addObserver(t){let e=this._observers.get(t);if(e)return e;e=new t(this),this._observers.set(t,e);for(const[t,n]of this.domRoots)e.observe(n,t);return e.enable(),e}getObserver(t){return this._observers.get(t)}disableObservers(){for(const t of this._observers.values())t.disable();}enableObservers(){for(const t of this._observers.values())t.enable();}scrollToTheSelection(){const t=this.document.selection.getFirstRange();t&&xs({target:this.domConverter.viewRangeToDom(t),viewportOffset:20});}focus(){if(!this.document.isFocused){const t=this.document.selection.editableElement;t?(this.domConverter.focus(t),this.render()):fs.a.warn("view-focus-no-selection: There is no selection in any editable to focus.");}}change(t){if(this._renderingInProgress||this._postFixersInProgress)throw new P.b("cannot-change-view-tree: Attempting to make changes to the view when it is in an incorrect state: rendering or post-fixers are in progress. This may cause some unexpected behavior and inconsistency between the DOM and the view.");if(this._ongoingChange)return t(this._writer);this._ongoingChange=!0;const e=t(this._writer);return this._ongoingChange=!1,this._renderingDisabled||(this._postFixersInProgress=!0,this.document._callPostFixers(this._writer),this._postFixersInProgress=!1,this.fire("render")),e}render(){this.change(()=>{});}destroy(){for(const t of this._observers.values())t.destroy();this.stopListening();}createPositionAt(t,e){return $i._createAt(t,e)}createPositionAfter(t){return $i._createAfter(t)}createPositionBefore(t){return $i._createBefore(t)}createRange(t,e){return new Gi(t,e)}createRangeOn(t){return Gi._createOn(t)}createRangeIn(t){return Gi._createIn(t)}createSelection(t,e,n){return new Ji(t,e,n)}_render(){this._renderingInProgress=!0,this.disableObservers(),this._renderer.render(),this.enableObservers(),this._renderingInProgress=!1;}}function Rs(t){return C(t)?di(t):new Map(t)}F(Os,Li);class Ds{constructor(t){this.parent=null,this._attrs=Rs(t);}get index(){let t;if(!this.parent)return null;if(null===(t=this.parent.getChildIndex(this)))throw new P.b("model-node-not-found-in-parent: The node's parent does not contain this node.");return t}get startOffset(){let t;if(!this.parent)return null;if(null===(t=this.parent.getChildStartOffset(this)))throw new P.b("model-node-not-found-in-parent: The node's parent does not contain this node.");return t}get offsetSize(){return 1}get endOffset(){return this.parent?this.startOffset+this.offsetSize:null}get nextSibling(){const t=this.index;return null!==t&&this.parent.getChild(t+1)||null}get previousSibling(){const t=this.index;return null!==t&&this.parent.getChild(t-1)||null}get root(){let t=this;for(;t.parent;)t=t.parent;return t}get document(){return this.root==this?null:this.root.document||null}getPath(){const t=[];let e=this;for(;e.parent;)t.unshift(e.startOffset),e=e.parent;return t}getAncestors(t={includeSelf:!1,parentFirst:!1}){const e=[];let n=t.includeSelf?this:this.parent;for(;n;)e[t.parentFirst?"push":"unshift"](n),n=n.parent;return e}getCommonAncestor(t,e={}){const n=this.getAncestors(e),i=t.getAncestors(e);let o=0;for(;n[o]==i[o]&&n[o];)o++;return 0===o?null:n[o-1]}isBefore(t){if(this==t)return !1;if(this.root!==t.root)return !1;const e=this.getPath(),n=t.getPath(),i=U(e,n);switch(i){case"prefix":return !0;case"extension":return !1;default:return e[i]<n[i]}}isAfter(t){return this!=t&&(this.root===t.root&&!this.isBefore(t))}hasAttribute(t){return this._attrs.has(t)}getAttribute(t){return this._attrs.get(t)}getAttributes(){return this._attrs.entries()}getAttributeKeys(){return this._attrs.keys()}toJSON(){const t={};return this._attrs.size&&(t.attributes=Array.from(this._attrs).reduce((t,e)=>(t[e[0]]=e[1],t),{})),t}_clone(){return new Ds(this._attrs)}_remove(){this.parent._removeChildren(this.index);}_setAttribute(t,e){this._attrs.set(t,e);}_setAttributesTo(t){this._attrs=Rs(t);}_removeAttribute(t){return this._attrs.delete(t)}_clearAttributes(){this._attrs.clear();}is(t){return "node"==t}}class Ls extends Ds{constructor(t,e){super(e),this._data=t||"";}get offsetSize(){return this.data.length}get data(){return this._data}is(t){return "text"==t||super.is(t)}toJSON(){const t=super.toJSON();return t.data=this.data,t}_clone(){return new Ls(this.data,this.getAttributes())}static fromJSON(t){return new Ls(t.data,t.attributes)}}class js{constructor(t,e,n){if(this.textNode=t,e<0||e>t.offsetSize)throw new P.b("model-textproxy-wrong-offsetintext: Given offsetInText value is incorrect.");if(n<0||e+n>t.offsetSize)throw new P.b("model-textproxy-wrong-length: Given length value is incorrect.");this.data=t.data.substring(e,e+n),this.offsetInText=e;}get startOffset(){return null!==this.textNode.startOffset?this.textNode.startOffset+this.offsetInText:null}get offsetSize(){return this.data.length}get endOffset(){return null!==this.startOffset?this.startOffset+this.offsetSize:null}get isPartial(){return this.offsetSize!==this.textNode.offsetSize}get parent(){return this.textNode.parent}get root(){return this.textNode.root}get document(){return this.textNode.document}is(t){return "textProxy"==t}getPath(){const t=this.textNode.getPath();return t.length>0&&(t[t.length-1]+=this.offsetInText),t}getAncestors(t={includeSelf:!1,parentFirst:!1}){const e=[];let n=t.includeSelf?this:this.parent;for(;n;)e[t.parentFirst?"push":"unshift"](n),n=n.parent;return e}hasAttribute(t){return this.textNode.hasAttribute(t)}getAttribute(t){return this.textNode.getAttribute(t)}getAttributes(){return this.textNode.getAttributes()}getAttributeKeys(){return this.textNode.getAttributeKeys()}}class Vs{constructor(t){this._nodes=[],t&&this._insertNodes(0,t);}[Symbol.iterator](){return this._nodes[Symbol.iterator]()}get length(){return this._nodes.length}get maxOffset(){return this._nodes.reduce((t,e)=>t+e.offsetSize,0)}getNode(t){return this._nodes[t]||null}getNodeIndex(t){const e=this._nodes.indexOf(t);return -1==e?null:e}getNodeStartOffset(t){const e=this.getNodeIndex(t);return null===e?null:this._nodes.slice(0,e).reduce((t,e)=>t+e.offsetSize,0)}indexToOffset(t){if(t==this._nodes.length)return this.maxOffset;const e=this._nodes[t];if(!e)throw new P.b("model-nodelist-index-out-of-bounds: Given index cannot be found in the node list.");return this.getNodeStartOffset(e)}offsetToIndex(t){let e=0;for(const n of this._nodes){if(t>=e&&t<e+n.offsetSize)return this.getNodeIndex(n);e+=n.offsetSize;}if(e!=t)throw new P.b("model-nodelist-offset-out-of-bounds: Given offset cannot be found in the node list.",{offset:t,nodeList:this});return this.length}_insertNodes(t,e){for(const t of e)if(!(t instanceof Ds))throw new P.b("model-nodelist-insertNodes-not-node: Trying to insert an object which is not a Node instance.");this._nodes.splice(t,0,...e);}_removeNodes(t,e=1){return this._nodes.splice(t,e)}toJSON(){return this._nodes.map(t=>t.toJSON())}}class zs extends Ds{constructor(t,e,n){super(e),this.name=t,this._children=new Vs,n&&this._insertChild(0,n);}get childCount(){return this._children.length}get maxOffset(){return this._children.maxOffset}get isEmpty(){return 0===this.childCount}is(t,e=null){return e?"element"==t&&e==this.name:"element"==t||t==this.name||super.is(t)}getChild(t){return this._children.getNode(t)}getChildren(){return this._children[Symbol.iterator]()}getChildIndex(t){return this._children.getNodeIndex(t)}getChildStartOffset(t){return this._children.getNodeStartOffset(t)}offsetToIndex(t){return this._children.offsetToIndex(t)}getNodeByPath(t){let e=this;for(const n of t)e=e.getChild(e.offsetToIndex(n));return e}toJSON(){const t=super.toJSON();if(t.name=this.name,this._children.length>0){t.children=[];for(const e of this._children)t.children.push(e.toJSON());}return t}_clone(t=!1){const e=t?Array.from(this._children).map(t=>t._clone(!0)):null;return new zs(this.name,this.getAttributes(),e)}_appendChild(t){this._insertChild(this.childCount,t);}_insertChild(t,e){const n=function(t){if("string"==typeof t)return [new Ls(t)];ui(t)||(t=[t]);return Array.from(t).map(t=>"string"==typeof t?new Ls(t):t instanceof js?new Ls(t.data,t.getAttributes()):t)}(e);for(const t of n)null!==t.parent&&t._remove(),t.parent=this;this._children._insertNodes(t,n);}_removeChildren(t,e=1){const n=this._children._removeNodes(t,e);for(const t of n)t.parent=null;return n}static fromJSON(t){let e=null;if(t.children){e=[];for(const n of t.children)n.name?e.push(zs.fromJSON(n)):e.push(Ls.fromJSON(n));}return new zs(t.name,t.attributes,e)}}class Bs{constructor(t={}){if(!t.boundaries&&!t.startPosition)throw new P.b("model-tree-walker-no-start-position: Neither boundaries nor starting position have been defined.");const e=t.direction||"forward";if("forward"!=e&&"backward"!=e)throw new P.b("model-tree-walker-unknown-direction: Only `backward` and `forward` direction allowed.",{direction:e});this.direction=e,this.boundaries=t.boundaries||null,t.startPosition?this.position=t.startPosition.clone():this.position=Hs._createAt(this.boundaries["backward"==this.direction?"end":"start"]),this.position.stickiness="toNone",this.singleCharacters=!!t.singleCharacters,this.shallow=!!t.shallow,this.ignoreElementEnd=!!t.ignoreElementEnd,this._boundaryStartParent=this.boundaries?this.boundaries.start.parent:null,this._boundaryEndParent=this.boundaries?this.boundaries.end.parent:null,this._visitedParent=this.position.parent;}[Symbol.iterator](){return this}skip(t){let e,n,i,o;do{i=this.position,o=this._visitedParent,({done:e,value:n}=this.next());}while(!e&&t(n));e||(this.position=i,this._visitedParent=o);}next(){return "forward"==this.direction?this._next():this._previous()}_next(){const t=this.position,e=this.position.clone(),n=this._visitedParent;if(null===n.parent&&e.offset===n.maxOffset)return {done:!0};if(n===this._boundaryEndParent&&e.offset==this.boundaries.end.offset)return {done:!0};const i=e.textNode?e.textNode:e.nodeAfter;if(i instanceof zs)return this.shallow?e.offset++:(e.path.push(0),this._visitedParent=i),this.position=e,Fs("elementStart",i,t,e,1);if(i instanceof Ls){let o;if(this.singleCharacters)o=1;else{let t=i.endOffset;this._boundaryEndParent==n&&this.boundaries.end.offset<t&&(t=this.boundaries.end.offset),o=t-e.offset;}const r=e.offset-i.startOffset,s=new js(i,r,o);return e.offset+=o,this.position=e,Fs("text",s,t,e,o)}return e.path.pop(),e.offset++,this.position=e,this._visitedParent=n.parent,this.ignoreElementEnd?this._next():Fs("elementEnd",n,t,e)}_previous(){const t=this.position,e=this.position.clone(),n=this._visitedParent;if(null===n.parent&&0===e.offset)return {done:!0};if(n==this._boundaryStartParent&&e.offset==this.boundaries.start.offset)return {done:!0};const i=e.textNode?e.textNode:e.nodeBefore;if(i instanceof zs)return e.offset--,this.shallow?(this.position=e,Fs("elementStart",i,t,e,1)):(e.path.push(i.maxOffset),this.position=e,this._visitedParent=i,this.ignoreElementEnd?this._previous():Fs("elementEnd",i,t,e));if(i instanceof Ls){let o;if(this.singleCharacters)o=1;else{let t=i.startOffset;this._boundaryStartParent==n&&this.boundaries.start.offset>t&&(t=this.boundaries.start.offset),o=e.offset-t;}const r=e.offset-i.startOffset,s=new js(i,r-o,o);return e.offset-=o,this.position=e,Fs("text",s,t,e,o)}return e.path.pop(),this.position=e,this._visitedParent=n.parent,Fs("elementStart",n,t,e,1)}}function Fs(t,e,n,i,o){return {done:!1,value:{type:t,item:e,previousPosition:n,nextPosition:i,length:o}}}var Us=function(t){var e=null==t?0:t.length;return e?t[e-1]:void 0};class Hs{constructor(t,e,n="toNone"){if(!t.is("element")&&!t.is("documentFragment"))throw new P.b("model-position-root-invalid: Position root invalid.");if(!(e instanceof Array)||0===e.length)throw new P.b("model-position-path-incorrect: Position path must be an array with at least one item.",{path:e});e=t.getPath().concat(e),t=t.root,this.root=t,this.path=e,this.stickiness=n;}get offset(){return Us(this.path)}set offset(t){this.path[this.path.length-1]=t;}get parent(){let t=this.root;for(let e=0;e<this.path.length-1;e++)t=t.getChild(t.offsetToIndex(this.path[e]));return t}get index(){return this.parent.offsetToIndex(this.offset)}get textNode(){const t=this.parent.getChild(this.index);return t instanceof Ls&&t.startOffset<this.offset?t:null}get nodeAfter(){return null===this.textNode?this.parent.getChild(this.index):null}get nodeBefore(){return null===this.textNode?this.parent.getChild(this.index-1):null}get isAtStart(){return 0===this.offset}get isAtEnd(){return this.offset==this.parent.maxOffset}compareWith(t){if(this.root!=t.root)return "different";const e=U(this.path,t.path);switch(e){case"same":return "same";case"prefix":return "before";case"extension":return "after";default:return this.path[e]<t.path[e]?"before":"after"}}getLastMatchingPosition(t,e={}){e.startPosition=this;const n=new Bs(e);return n.skip(t),n.position}getParentPath(){return this.path.slice(0,-1)}getAncestors(){return this.parent.is("documentFragment")?[this.parent]:this.parent.getAncestors({includeSelf:!0})}getCommonPath(t){if(this.root!=t.root)return [];const e=U(this.path,t.path),n="string"==typeof e?Math.min(this.path.length,t.path.length):e;return this.path.slice(0,n)}getCommonAncestor(t){const e=this.getAncestors(),n=t.getAncestors();let i=0;for(;e[i]==n[i]&&e[i];)i++;return 0===i?null:e[i-1]}getShiftedBy(t){const e=this.clone(),n=e.offset+t;return e.offset=n<0?0:n,e}isAfter(t){return "after"==this.compareWith(t)}isBefore(t){return "before"==this.compareWith(t)}isEqual(t){return "same"==this.compareWith(t)}isTouching(t){let e=null,n=null;switch(this.compareWith(t)){case"same":return !0;case"before":e=Hs._createAt(this),n=Hs._createAt(t);break;case"after":e=Hs._createAt(t),n=Hs._createAt(this);break;default:return !1}let i=e.parent;for(;e.path.length+n.path.length;){if(e.isEqual(n))return !0;if(e.path.length>n.path.length){if(e.offset!==i.maxOffset)return !1;e.path=e.path.slice(0,-1),i=i.parent,e.offset++;}else{if(0!==n.offset)return !1;n.path=n.path.slice(0,-1);}}}hasSameParentAs(t){if(this.root!==t.root)return !1;return "same"==U(this.getParentPath(),t.getParentPath())}getTransformedByOperation(t){let e;switch(t.type){case"insert":e=this._getTransformedByInsertOperation(t);break;case"move":case"remove":case"reinsert":e=this._getTransformedByMoveOperation(t);break;case"split":e=this._getTransformedBySplitOperation(t);break;case"merge":e=this._getTransformedByMergeOperation(t);break;default:e=Hs._createAt(this);}return e}_getTransformedByInsertOperation(t){return this._getTransformedByInsertion(t.position,t.howMany)}_getTransformedByMoveOperation(t){return this._getTransformedByMove(t.sourcePosition,t.targetPosition,t.howMany)}_getTransformedBySplitOperation(t){const e=t.movedRange;return e.containsPosition(this)||e.start.isEqual(this)&&"toNext"==this.stickiness?this._getCombined(t.splitPosition,t.moveTargetPosition):t.graveyardPosition?this._getTransformedByMove(t.graveyardPosition,t.insertionPosition,1):this._getTransformedByInsertion(t.insertionPosition,1)}_getTransformedByMergeOperation(t){const e=t.movedRange;let n;return e.containsPosition(this)||e.start.isEqual(this)?(n=this._getCombined(t.sourcePosition,t.targetPosition),t.sourcePosition.isBefore(t.targetPosition)&&(n=n._getTransformedByDeletion(t.deletionPosition,1))):n=this.isEqual(t.deletionPosition)?Hs._createAt(t.deletionPosition):this._getTransformedByMove(t.deletionPosition,t.graveyardPosition,1),n}_getTransformedByDeletion(t,e){const n=Hs._createAt(this);if(this.root!=t.root)return n;if("same"==U(t.getParentPath(),this.getParentPath())){if(t.offset<this.offset){if(t.offset+e>this.offset)return null;n.offset-=e;}}else if("prefix"==U(t.getParentPath(),this.getParentPath())){const i=t.path.length-1;if(t.offset<=this.path[i]){if(t.offset+e>this.path[i])return null;n.path[i]-=e;}}return n}_getTransformedByInsertion(t,e){const n=Hs._createAt(this);if(this.root!=t.root)return n;if("same"==U(t.getParentPath(),this.getParentPath()))(t.offset<this.offset||t.offset==this.offset&&"toPrevious"!=this.stickiness)&&(n.offset+=e);else if("prefix"==U(t.getParentPath(),this.getParentPath())){const i=t.path.length-1;t.offset<=this.path[i]&&(n.path[i]+=e);}return n}_getTransformedByMove(t,e,n){if(e=e._getTransformedByDeletion(t,n),t.isEqual(e))return Hs._createAt(this);const i=this._getTransformedByDeletion(t,n);return null===i||t.isEqual(this)&&"toNext"==this.stickiness||t.getShiftedBy(n).isEqual(this)&&"toPrevious"==this.stickiness?this._getCombined(t,e):i._getTransformedByInsertion(e,n)}_getCombined(t,e){const n=t.path.length-1,i=Hs._createAt(e);return i.stickiness=this.stickiness,i.offset=i.offset+this.path[n]-t.offset,i.path=i.path.concat(this.path.slice(n+1)),i}toJSON(){return {root:this.root.toJSON(),path:Array.from(this.path),stickiness:this.stickiness}}clone(){return new this.constructor(this.root,this.path,this.stickiness)}static _createAt(t,e){if(t instanceof Hs)return new Hs(t.root,t.path,t.stickiness);{const n=t;if("end"==e)e=n.maxOffset;else{if("before"==e)return this._createBefore(n);if("after"==e)return this._createAfter(n);if(0!==e&&!e)throw new P.b("model-createPositionAt-offset-required: Model#createPositionAt() requires the offset when the first parameter is a model item.")}if(!n.is("element")&&!n.is("documentFragment"))throw new P.b("model-position-parent-incorrect: Position parent have to be a element or document fragment.");const i=n.getPath();return i.push(e),new this(n.root,i)}}static _createAfter(t){if(!t.parent)throw new P.b("model-position-after-root: You cannot make a position after root.",{root:t});return this._createAt(t.parent,t.endOffset)}static _createBefore(t){if(!t.parent)throw new P.b("model-position-before-root: You cannot make a position before root.",{root:t});return this._createAt(t.parent,t.startOffset)}static fromJSON(t,e){if("$graveyard"===t.root){const n=new Hs(e.graveyard,t.path);return n.stickiness=t.stickiness,n}if(!e.getRoot(t.root))throw new P.b("model-position-fromjson-no-root: Cannot create position for document. Root with specified name does not exist.",{rootName:t.root});const n=new Hs(e.getRoot(t.root),t.path);return n.stickiness=t.stickiness,n}}class qs{constructor(t,e=null){this.start=Hs._createAt(t),this.end=e?Hs._createAt(e):Hs._createAt(t),this.start.stickiness=this.isCollapsed?"toNone":"toNext",this.end.stickiness=this.isCollapsed?"toNone":"toPrevious";}*[Symbol.iterator](){yield*new Bs({boundaries:this,ignoreElementEnd:!0});}get isCollapsed(){return this.start.isEqual(this.end)}get isFlat(){return "same"==U(this.start.getParentPath(),this.end.getParentPath())}get root(){return this.start.root}containsPosition(t){return t.isAfter(this.start)&&t.isBefore(this.end)}containsRange(t,e=!1){t.isCollapsed&&(e=!1);const n=this.containsPosition(t.start)||e&&this.start.isEqual(t.start),i=this.containsPosition(t.end)||e&&this.end.isEqual(t.end);return n&&i}containsItem(t){const e=Hs._createBefore(t);return this.containsPosition(e)||this.start.isEqual(e)}isEqual(t){return this.start.isEqual(t.start)&&this.end.isEqual(t.end)}isIntersecting(t){return this.start.isBefore(t.end)&&this.end.isAfter(t.start)}getDifference(t){const e=[];return this.isIntersecting(t)?(this.containsPosition(t.start)&&e.push(new qs(this.start,t.start)),this.containsPosition(t.end)&&e.push(new qs(t.end,this.end))):e.push(new qs(this.start,this.end)),e}getIntersection(t){if(this.isIntersecting(t)){let e=this.start,n=this.end;return this.containsPosition(t.start)&&(e=t.start),this.containsPosition(t.end)&&(n=t.end),new qs(e,n)}return null}getMinimalFlatRanges(){const t=[],e=this.start.getCommonPath(this.end).length,n=Hs._createAt(this.start);let i=n.parent;for(;n.path.length>e+1;){const e=i.maxOffset-n.offset;0!==e&&t.push(new qs(n,n.getShiftedBy(e))),n.path=n.path.slice(0,-1),n.offset++,i=i.parent;}for(;n.path.length<=this.end.path.length;){const e=this.end.path[n.path.length-1],i=e-n.offset;0!==i&&t.push(new qs(n,n.getShiftedBy(i))),n.offset=e,n.path.push(0);}return t}getWalker(t={}){return t.boundaries=this,new Bs(t)}*getItems(t={}){t.boundaries=this,t.ignoreElementEnd=!0;const e=new Bs(t);for(const t of e)yield t.item;}*getPositions(t={}){t.boundaries=this;const e=new Bs(t);yield e.position;for(const t of e)yield t.nextPosition;}getTransformedByOperation(t){switch(t.type){case"insert":return this._getTransformedByInsertOperation(t);case"move":case"remove":case"reinsert":return this._getTransformedByMoveOperation(t);case"split":return [this._getTransformedBySplitOperation(t)];case"merge":return [this._getTransformedByMergeOperation(t)]}return [new qs(this.start,this.end)]}getTransformedByOperations(t){const e=[new qs(this.start,this.end)];for(const n of t)for(let t=0;t<e.length;t++){const i=e[t].getTransformedByOperation(n);e.splice(t,1,...i),t+=i.length-1;}for(let t=0;t<e.length;t++){const n=e[t];for(let i=t+1;i<e.length;i++){const t=e[i];(n.containsRange(t)||t.containsRange(n)||n.isEqual(t))&&e.splice(i,1);}}return e}getCommonAncestor(){return this.start.getCommonAncestor(this.end)}toJSON(){return {start:this.start.toJSON(),end:this.end.toJSON()}}clone(){return new this.constructor(this.start,this.end)}_getTransformedByInsertOperation(t,e=!1){return this._getTransformedByInsertion(t.position,t.howMany,e)}_getTransformedByMoveOperation(t,e=!1){const n=t.sourcePosition,i=t.howMany,o=t.targetPosition;return this._getTransformedByMove(n,o,i,e)}_getTransformedBySplitOperation(t){const e=this.start._getTransformedBySplitOperation(t);let n=this.end._getTransformedBySplitOperation(t);return this.end.isEqual(t.insertionPosition)&&(n=this.end.getShiftedBy(1)),e.root!=n.root&&(n=this.end.getShiftedBy(-1)),new qs(e,n)}_getTransformedByMergeOperation(t){let e=this.start._getTransformedByMergeOperation(t),n=this.end._getTransformedByMergeOperation(t);return e.root!=n.root&&(n=this.end.getShiftedBy(-1)),e.isAfter(n)?(t.sourcePosition.isBefore(t.targetPosition)?(e=Hs._createAt(n)).offset=0:(t.deletionPosition.isEqual(e)||(n=t.deletionPosition),e=t.targetPosition),new qs(e,n)):new qs(e,n)}_getTransformedByInsertion(t,e,n=!1){if(n&&this.containsPosition(t))return [new qs(this.start,t),new qs(t.getShiftedBy(e),this.end._getTransformedByInsertion(t,e))];{const n=new qs(this.start,this.end);return n.start=n.start._getTransformedByInsertion(t,e),n.end=n.end._getTransformedByInsertion(t,e),[n]}}_getTransformedByMove(t,e,n,i=!1){if(this.isCollapsed){const i=this.start._getTransformedByMove(t,e,n);return [new qs(i)]}const o=qs._createFromPositionAndShift(t,n),r=e._getTransformedByDeletion(t,n);if(this.containsPosition(e)&&!i&&(o.containsPosition(this.start)||o.containsPosition(this.end))){const i=this.start._getTransformedByMove(t,e,n),o=this.end._getTransformedByMove(t,e,n);return [new qs(i,o)]}let s;const a=this.getDifference(o);let c=null;const l=this.getIntersection(o);if(1==a.length?c=new qs(a[0].start._getTransformedByDeletion(t,n),a[0].end._getTransformedByDeletion(t,n)):2==a.length&&(c=new qs(this.start,this.end._getTransformedByDeletion(t,n))),s=c?c._getTransformedByInsertion(r,n,null!==l||i):[],l){const t=new qs(l.start._getCombined(o.start,r),l.end._getCombined(o.start,r));2==s.length?s.splice(1,0,t):s.push(t);}return s}_getTransformedByDeletion(t,e){let n=this.start._getTransformedByDeletion(t,e),i=this.end._getTransformedByDeletion(t,e);return null==n&&null==i?null:(null==n&&(n=t),null==i&&(i=t),new qs(n,i))}static _createFromPositionAndShift(t,e){const n=t,i=t.getShiftedBy(e);return e>0?new this(n,i):new this(i,n)}static _createIn(t){return new this(Hs._createAt(t,0),Hs._createAt(t,t.maxOffset))}static _createOn(t){return this._createFromPositionAndShift(Hs._createBefore(t),t.offsetSize)}static _createFromRanges(t){if(0===t.length)throw new P.b("range-create-from-ranges-empty-array: At least one range has to be passed.");if(1==t.length)return t[0].clone();const e=t[0];t.sort((t,e)=>t.start.isAfter(e.start)?1:-1);const n=t.indexOf(e),i=new this(e.start,e.end);if(n>0)for(let e=n-1;t[e].end.isEqual(i.start);e++)i.start=Hs._createAt(t[e].start);for(let e=n+1;e<t.length&&t[e].start.isEqual(i.end);e++)i.end=Hs._createAt(t[e].end);return i}static fromJSON(t,e){return new this(Hs.fromJSON(t.start,e),Hs.fromJSON(t.end,e))}}class Ws{constructor(){this._modelToViewMapping=new WeakMap,this._viewToModelMapping=new WeakMap,this._viewToModelLengthCallbacks=new Map,this._markerNameToElements=new Map,this.on("modelToViewPosition",(t,e)=>{if(e.viewPosition)return;const n=this._modelToViewMapping.get(e.modelPosition.parent);e.viewPosition=this._findPositionIn(n,e.modelPosition.offset);},{priority:"low"}),this.on("viewToModelPosition",(t,e)=>{if(e.modelPosition)return;let n=e.viewPosition.parent,i=this._viewToModelMapping.get(n);for(;!i;)n=n.parent,i=this._viewToModelMapping.get(n);const o=this._toModelOffset(e.viewPosition.parent,e.viewPosition.offset,n);e.modelPosition=Hs._createAt(i,o);},{priority:"low"});}bindElements(t,e){this._modelToViewMapping.set(t,e),this._viewToModelMapping.set(e,t);}unbindViewElement(t){const e=this.toModelElement(t);this._viewToModelMapping.delete(t),this._modelToViewMapping.get(e)==t&&this._modelToViewMapping.delete(e);}unbindModelElement(t){const e=this.toViewElement(t);this._modelToViewMapping.delete(t),this._viewToModelMapping.get(e)==t&&this._viewToModelMapping.delete(e);}bindElementToMarker(t,e){const n=this._markerNameToElements.get(e)||new Set;n.add(t),this._markerNameToElements.set(e,n);}unbindElementsFromMarkerName(t){this._markerNameToElements.delete(t);}clearBindings(){this._modelToViewMapping=new WeakMap,this._viewToModelMapping=new WeakMap,this._markerNameToElements=new Map;}toModelElement(t){return this._viewToModelMapping.get(t)}toViewElement(t){return this._modelToViewMapping.get(t)}toModelRange(t){return new qs(this.toModelPosition(t.start),this.toModelPosition(t.end))}toViewRange(t){return new Gi(this.toViewPosition(t.start),this.toViewPosition(t.end))}toModelPosition(t){const e={viewPosition:t,mapper:this};return this.fire("viewToModelPosition",e),e.modelPosition}toViewPosition(t,e={isPhantom:!1}){const n={modelPosition:t,mapper:this,isPhantom:e.isPhantom};return this.fire("modelToViewPosition",n),n.viewPosition}markerNameToElements(t){const e=this._markerNameToElements.get(t);if(!e)return null;const n=new Set;for(const t of e)if(t.is("attributeElement"))for(const e of t.getElementsWithSameId())n.add(e);else n.add(t);return n}registerViewToModelLength(t,e){this._viewToModelLengthCallbacks.set(t,e);}_toModelOffset(t,e,n){if(n!=t){return this._toModelOffset(t.parent,t.index,n)+this._toModelOffset(t,e,t)}if(t.is("text"))return e;let i=0;for(let n=0;n<e;n++)i+=this.getModelLength(t.getChild(n));return i}getModelLength(t){if(this._viewToModelLengthCallbacks.get(t.name)){return this._viewToModelLengthCallbacks.get(t.name)(t)}if(this._viewToModelMapping.has(t))return 1;if(t.is("text"))return t.data.length;if(t.is("uiElement"))return 0;{let e=0;for(const n of t.getChildren())e+=this.getModelLength(n);return e}}_findPositionIn(t,e){let n,i=0,o=0,r=0;if(t.is("text"))return new $i(t,e);for(;o<e;)n=t.getChild(r),o+=i=this.getModelLength(n),r++;return o==e?this._moveViewPositionToTextNode(new $i(t,r)):this._findPositionIn(n,e-(o-i))}_moveViewPositionToTextNode(t){const e=t.nodeBefore,n=t.nodeAfter;return e instanceof ci?new $i(e,e.data.length):n instanceof ci?new $i(n,0):t}}F(Ws,R);class Ys{constructor(){this._consumable=new Map,this._textProxyRegistry=new Map;}add(t,e){e=$s(e),t instanceof js&&(t=this._getSymbolForTextProxy(t)),this._consumable.has(t)||this._consumable.set(t,new Map),this._consumable.get(t).set(e,!0);}consume(t,e){return e=$s(e),t instanceof js&&(t=this._getSymbolForTextProxy(t)),!!this.test(t,e)&&(this._consumable.get(t).set(e,!1),!0)}test(t,e){e=$s(e),t instanceof js&&(t=this._getSymbolForTextProxy(t));const n=this._consumable.get(t);if(void 0===n)return null;const i=n.get(e);return void 0===i?null:i}revert(t,e){e=$s(e),t instanceof js&&(t=this._getSymbolForTextProxy(t));const n=this.test(t,e);return !1===n?(this._consumable.get(t).set(e,!0),!0):!0!==n&&null}_getSymbolForTextProxy(t){let e=null;const n=this._textProxyRegistry.get(t.startOffset);if(n){const i=n.get(t.endOffset);i&&(e=i.get(t.parent));}return e||(e=this._addSymbolForTextProxy(t.startOffset,t.endOffset,t.parent)),e}_addSymbolForTextProxy(t,e,n){const i=Symbol("textProxySymbol");let o,r;return (o=this._textProxyRegistry.get(t))||(o=new Map,this._textProxyRegistry.set(t,o)),(r=o.get(e))||(r=new Map,o.set(e,r)),r.set(n,i),i}}function $s(t){const e=t.split(":");return e.length>1?e[0]+":"+e[1]:e[0]}class Gs{constructor(t={}){this.conversionApi=Ei({dispatcher:this},t);}convertChanges(t,e){for(const n of t.getMarkersToRemove())this.convertMarkerRemove(n.name,n.range,e);for(const n of t.getChanges())"insert"==n.type?this.convertInsert(qs._createFromPositionAndShift(n.position,n.length),e):"remove"==n.type?this.convertRemove(n.position,n.length,n.name,e):this.convertAttribute(n.range,n.attributeKey,n.attributeOldValue,n.attributeNewValue,e);for(const n of t.getMarkersToAdd())this.convertMarkerAdd(n.name,n.range,e);}convertInsert(t,e){this.conversionApi.writer=e,this.conversionApi.consumable=this._createInsertConsumable(t);for(const e of t){const t=e.item,n={item:t,range:qs._createFromPositionAndShift(e.previousPosition,e.length)};this._testAndFire("insert",n);for(const e of t.getAttributeKeys())n.attributeKey=e,n.attributeOldValue=null,n.attributeNewValue=t.getAttribute(e),this._testAndFire(`attribute:${e}`,n);}this._clearConversionApi();}convertRemove(t,e,n,i){this.conversionApi.writer=i,this.fire("remove:"+n,{position:t,length:e},this.conversionApi),this._clearConversionApi();}convertAttribute(t,e,n,i,o){this.conversionApi.writer=o,this.conversionApi.consumable=this._createConsumableForRange(t,`attribute:${e}`);for(const o of t){const t={item:o.item,range:qs._createFromPositionAndShift(o.previousPosition,o.length),attributeKey:e,attributeOldValue:n,attributeNewValue:i};this._testAndFire(`attribute:${e}`,t);}this._clearConversionApi();}convertSelection(t,e,n){const i=Array.from(e.getMarkersAtPosition(t.getFirstPosition()));if(this.conversionApi.writer=n,this.conversionApi.consumable=this._createSelectionConsumable(t,i),this.fire("selection",{selection:t},this.conversionApi),t.isCollapsed){for(const e of i){const n=e.getRange();if(!Qs(t.getFirstPosition(),e,this.conversionApi.mapper))continue;const i={item:t,markerName:e.name,markerRange:n};this.conversionApi.consumable.test(t,"addMarker:"+e.name)&&this.fire("addMarker:"+e.name,i,this.conversionApi);}for(const e of t.getAttributeKeys()){const n={item:t,range:t.getFirstRange(),attributeKey:e,attributeOldValue:null,attributeNewValue:t.getAttribute(e)};this.conversionApi.consumable.test(t,"attribute:"+n.attributeKey)&&this.fire("attribute:"+n.attributeKey,n,this.conversionApi);}this._clearConversionApi();}}convertMarkerAdd(t,e,n){if(!e.root.document||"$graveyard"==e.root.rootName)return;this.conversionApi.writer=n;const i="addMarker:"+t;if(e.isCollapsed){const n=new Ys;return n.add(e,i),this.conversionApi.consumable=n,void this.fire(i,{markerName:t,markerRange:e},this.conversionApi)}this.conversionApi.consumable=this._createConsumableForRange(e,i);for(const n of e.getItems()){if(!this.conversionApi.consumable.test(n,i))continue;const o={item:n,range:qs._createOn(n),markerName:t,markerRange:e};this.fire(i,o,this.conversionApi);}this._clearConversionApi();}convertMarkerRemove(t,e,n){e.root.document&&"$graveyard"!=e.root.rootName&&(this.conversionApi.writer=n,this.fire("removeMarker:"+t,{markerName:t,markerRange:e},this.conversionApi),this._clearConversionApi());}_createInsertConsumable(t){const e=new Ys;for(const n of t){const t=n.item;e.add(t,"insert");for(const n of t.getAttributeKeys())e.add(t,"attribute:"+n);}return e}_createConsumableForRange(t,e){const n=new Ys;for(const i of t.getItems())n.add(i,e);return n}_createSelectionConsumable(t,e){const n=new Ys;n.add(t,"selection");for(const i of e)n.add(t,"addMarker:"+i.name);for(const e of t.getAttributeKeys())n.add(t,"attribute:"+e);return n}_testAndFire(t,e){if(!this.conversionApi.consumable.test(e.item,t))return;const n=e.item.name||"$text";this.fire(t+":"+n,e,this.conversionApi);}_clearConversionApi(){delete this.conversionApi.writer,delete this.conversionApi.consumable;}}function Qs(t,e,n){const i=e.getRange(),o=Array.from(t.getAncestors());return o.shift(),o.reverse(),!o.some(t=>{if(i.containsItem(t)){return !!n.toViewElement(t).getCustomProperty("addHighlight")}})}F(Gs,R);class Ks{constructor(t,e,n){this._lastRangeBackward=!1,this._ranges=[],this._attrs=new Map,t&&this.setTo(t,e,n);}get anchor(){if(this._ranges.length>0){const t=this._ranges[this._ranges.length-1];return this._lastRangeBackward?t.end:t.start}return null}get focus(){if(this._ranges.length>0){const t=this._ranges[this._ranges.length-1];return this._lastRangeBackward?t.start:t.end}return null}get isCollapsed(){return 1===this._ranges.length&&this._ranges[0].isCollapsed}get rangeCount(){return this._ranges.length}get isBackward(){return !this.isCollapsed&&this._lastRangeBackward}isEqual(t){if(this.rangeCount!=t.rangeCount)return !1;if(0===this.rangeCount)return !0;if(!this.anchor.isEqual(t.anchor)||!this.focus.isEqual(t.focus))return !1;for(const e of this._ranges){let n=!1;for(const i of t._ranges)if(e.isEqual(i)){n=!0;break}if(!n)return !1}return !0}*getRanges(){for(const t of this._ranges)yield new qs(t.start,t.end);}getFirstRange(){let t=null;for(const e of this._ranges)t&&!e.start.isBefore(t.start)||(t=e);return t?new qs(t.start,t.end):null}getLastRange(){let t=null;for(const e of this._ranges)t&&!e.end.isAfter(t.end)||(t=e);return t?new qs(t.start,t.end):null}getFirstPosition(){const t=this.getFirstRange();return t?t.start.clone():null}getLastPosition(){const t=this.getLastRange();return t?t.end.clone():null}setTo(t,e,n){if(null===t)this._setRanges([]);else if(t instanceof Ks)this._setRanges(t.getRanges(),t.isBackward);else if(t&&"function"==typeof t.getRanges)this._setRanges(t.getRanges(),t.isBackward);else if(t instanceof qs)this._setRanges([t],!!e&&!!e.backward);else if(t instanceof Hs)this._setRanges([new qs(t)]);else if(t instanceof Ds){const i=!!n&&!!n.backward;let o;if("in"==e)o=qs._createIn(t);else if("on"==e)o=qs._createOn(t);else{if(void 0===e)throw new P.b("model-selection-setTo-required-second-parameter: selection.setTo requires the second parameter when the first parameter is a node.");o=new qs(Hs._createAt(t,e));}this._setRanges([o],i);}else{if(!ui(t))throw new P.b("model-selection-setTo-not-selectable: Cannot set selection to given place.");this._setRanges(t,e&&!!e.backward);}}_setRanges(t,e=!1){const n=(t=Array.from(t)).some(t=>{if(!(t instanceof qs))throw new P.b("model-selection-set-ranges-not-range: Selection range set to an object that is not an instance of model.Range.");return this._ranges.every(e=>!e.isEqual(t))});if(t.length!==this._ranges.length||n){this._removeAllRanges();for(const e of t)this._pushRange(e);this._lastRangeBackward=!!e,this.fire("change:range",{directChange:!0});}}setFocus(t,e){if(null===this.anchor)throw new P.b("model-selection-setFocus-no-ranges: Cannot set selection focus if there are no ranges in selection.");const n=Hs._createAt(t,e);if("same"==n.compareWith(this.focus))return;const i=this.anchor;this._ranges.length&&this._popRange(),"before"==n.compareWith(i)?(this._pushRange(new qs(n,i)),this._lastRangeBackward=!0):(this._pushRange(new qs(i,n)),this._lastRangeBackward=!1),this.fire("change:range",{directChange:!0});}getAttribute(t){return this._attrs.get(t)}getAttributes(){return this._attrs.entries()}getAttributeKeys(){return this._attrs.keys()}hasAttribute(t){return this._attrs.has(t)}removeAttribute(t){this.hasAttribute(t)&&(this._attrs.delete(t),this.fire("change:attribute",{attributeKeys:[t],directChange:!0}));}setAttribute(t,e){this.getAttribute(t)!==e&&(this._attrs.set(t,e),this.fire("change:attribute",{attributeKeys:[t],directChange:!0}));}getSelectedElement(){if(1!==this.rangeCount)return null;const t=this.getFirstRange(),e=t.start.nodeAfter,n=t.end.nodeBefore;return e instanceof zs&&e==n?e:null}*getSelectedBlocks(){const t=new WeakSet;for(const e of this.getRanges()){const n=Zs(e.start,t);n&&(yield n);for(const n of e.getWalker())"elementEnd"==n.type&&Js(n.item,t)&&(yield n.item);const i=Zs(e.end,t);i&&!e.end.isTouching(Hs._createAt(i,0))&&(yield i);}}containsEntireContent(t=this.anchor.root){const e=Hs._createAt(t,0),n=Hs._createAt(t,"end");return e.isTouching(this.getFirstPosition())&&n.isTouching(this.getLastPosition())}_pushRange(t){this._checkRange(t),this._ranges.push(new qs(t.start,t.end));}_checkRange(t){for(let e=0;e<this._ranges.length;e++)if(t.isIntersecting(this._ranges[e]))throw new P.b("model-selection-range-intersects: Trying to add a range that intersects with another range in the selection.",{addedRange:t,intersectingRange:this._ranges[e]})}_removeAllRanges(){for(;this._ranges.length>0;)this._popRange();}_popRange(){this._ranges.pop();}}function Js(t,e){return !e.has(t)&&(e.add(t),t.document.model.schema.isBlock(t)&&t.parent)}function Zs(t,e){const n=t.parent.getAncestors({parentFirst:!0,includeSelf:!0}),i=n.find(t=>Js(t,e));return n.forEach(t=>e.add(t)),i}F(Ks,R);class Xs extends qs{constructor(t,e){super(t,e),function(){this.listenTo(this.root.document.model,"applyOperation",(t,e)=>{const n=e[0];n.isDocumentOperation&&function(t){const e=this.getTransformedByOperation(t),n=qs._createFromRanges(e),i=!n.isEqual(this),o=function(t,e){switch(e.type){case"insert":return t.containsPosition(e.position);case"move":case"remove":case"reinsert":case"merge":return t.containsPosition(e.sourcePosition)||t.start.isEqual(e.sourcePosition)||t.containsPosition(e.targetPosition);case"split":return t.containsPosition(e.splitPosition)||t.containsPosition(e.insertionPosition)}return !1}(this,t);let r=null;if(i){"$graveyard"==n.root.rootName&&(r="remove"==t.type?t.sourcePosition:t.deletionPosition);const e=this.toRange();this.start=n.start,this.end=n.end,this.fire("change:range",e,{deletionPosition:r});}else o&&this.fire("change:content",this.toRange(),{deletionPosition:r});}.call(this,n);},{priority:"low"});}.call(this);}detach(){this.stopListening();}toRange(){return new qs(this.start,this.end)}static fromRange(t){return new Xs(t.start,t.end)}}F(Xs,R);const ta="selection:";class ea{constructor(t){this._selection=new na(t),this._selection.delegate("change:range").to(this),this._selection.delegate("change:attribute").to(this);}get isCollapsed(){return this._selection.isCollapsed}get anchor(){return this._selection.anchor}get focus(){return this._selection.focus}get rangeCount(){return this._selection.rangeCount}get hasOwnRange(){return this._selection.hasOwnRange}get isBackward(){return this._selection.isBackward}get isGravityOverridden(){return this._selection.isGravityOverridden}get _ranges(){return this._selection._ranges}getRanges(){return this._selection.getRanges()}getFirstPosition(){return this._selection.getFirstPosition()}getLastPosition(){return this._selection.getLastPosition()}getFirstRange(){return this._selection.getFirstRange()}getLastRange(){return this._selection.getLastRange()}getSelectedBlocks(){return this._selection.getSelectedBlocks()}getSelectedElement(){return this._selection.getSelectedElement()}containsEntireContent(t){return this._selection.containsEntireContent(t)}destroy(){this._selection.destroy();}getAttributeKeys(){return this._selection.getAttributeKeys()}getAttributes(){return this._selection.getAttributes()}getAttribute(t){return this._selection.getAttribute(t)}hasAttribute(t){return this._selection.hasAttribute(t)}_setFocus(t,e){this._selection.setFocus(t,e);}_setTo(t,e,n){this._selection.setTo(t,e,n);}_setAttribute(t,e){this._selection.setAttribute(t,e);}_removeAttribute(t){this._selection.removeAttribute(t);}_getStoredAttributes(){return this._selection._getStoredAttributes()}_overrideGravity(){return this._selection.overrideGravity()}_restoreGravity(t){this._selection.restoreGravity(t);}static _getStoreAttributeKey(t){return ta+t}static _isStoreAttributeKey(t){return t.startsWith(ta)}}F(ea,R);class na extends Ks{constructor(t){super(),this._model=t.model,this._document=t,this._attributePriority=new Map,this._fixGraveyardRangesData=[],this._hasChangedRange=!1,this._overriddenGravityRegister=new Set,this.on("change:range",()=>{for(const t of this.getRanges())if(!this._document._validateSelectionRange(t))throw new P.b("document-selection-wrong-position: Range from document selection starts or ends at incorrect position.",{range:t})}),this.listenTo(this._document,"change",(t,e)=>{this._updateAttributes(!1),function(t,e){const n=t.document.differ;for(const i of n.getChanges()){if("insert"!=i.type)continue;const n=i.position.parent,o=i.length===n.maxOffset;o&&t.enqueueChange(e,t=>{const e=Array.from(n.getAttributeKeys()).filter(t=>t.startsWith(ta));for(const i of e)t.removeAttribute(i,n);});}}(this._model,e);}),this.listenTo(this._model,"applyOperation",()=>{for(;this._fixGraveyardRangesData.length;){const{liveRange:t,sourcePosition:e}=this._fixGraveyardRangesData.shift();this._fixGraveyardSelection(t,e);}this._hasChangedRange&&(this._hasChangedRange=!1,this.fire("change:range",{directChange:!1}));},{priority:"lowest"});}get isCollapsed(){return 0===this._ranges.length?this._document._getDefaultRange().isCollapsed:super.isCollapsed}get anchor(){return super.anchor||this._document._getDefaultRange().start}get focus(){return super.focus||this._document._getDefaultRange().end}get rangeCount(){return this._ranges.length?this._ranges.length:1}get hasOwnRange(){return this._ranges.length>0}get isGravityOverridden(){return !!this._overriddenGravityRegister.size}destroy(){for(let t=0;t<this._ranges.length;t++)this._ranges[t].detach();this.stopListening();}*getRanges(){this._ranges.length?yield*super.getRanges():yield this._document._getDefaultRange();}getFirstRange(){return super.getFirstRange()||this._document._getDefaultRange()}getLastRange(){return super.getLastRange()||this._document._getDefaultRange()}setTo(t,e,n){super.setTo(t,e,n),this._refreshAttributes();}setFocus(t,e){super.setFocus(t,e),this._refreshAttributes();}setAttribute(t,e){if(this._setAttribute(t,e)){const e=[t];this.fire("change:attribute",{attributeKeys:e,directChange:!0});}}removeAttribute(t){if(this._removeAttribute(t)){const e=[t];this.fire("change:attribute",{attributeKeys:e,directChange:!0});}}overrideGravity(){const t=I();return this._overriddenGravityRegister.add(t),1===this._overriddenGravityRegister.size&&this._refreshAttributes(),t}restoreGravity(t){if(!this._overriddenGravityRegister.has(t))throw new P.b("document-selection-gravity-wrong-restore: Attempting to restore the selection gravity for an unknown UID.",{uid:t});this._overriddenGravityRegister.delete(t),this.isGravityOverridden||this._refreshAttributes();}_refreshAttributes(){this._updateAttributes(!0);}_popRange(){this._ranges.pop().detach();}_pushRange(t){const e=this._prepareRange(t);e&&this._ranges.push(e);}_prepareRange(t){if(this._checkRange(t),t.root==this._document.graveyard)return void fs.a.warn("model-selection-range-in-graveyard: Trying to add a Range that is in the graveyard root. Range rejected.");const e=Xs.fromRange(t);return e.on("change:range",(t,n,i)=>{this._hasChangedRange=!0,e.root==this._document.graveyard&&this._fixGraveyardRangesData.push({liveRange:e,sourcePosition:i.deletionPosition});}),e}_updateAttributes(t){const e=Rs(this._getSurroundingAttributes()),n=Rs(this.getAttributes());if(t)this._attributePriority=new Map,this._attrs=new Map;else for(const[t,e]of this._attributePriority)"low"==e&&(this._attrs.delete(t),this._attributePriority.delete(t));this._setAttributesTo(e);const i=[];for(const[t,e]of this.getAttributes())n.has(t)&&n.get(t)===e||i.push(t);for(const[t]of n)this.hasAttribute(t)||i.push(t);i.length>0&&this.fire("change:attribute",{attributeKeys:i,directChange:!1});}_setAttribute(t,e,n=!0){const i=n?"normal":"low";return ("low"!=i||"normal"!=this._attributePriority.get(t))&&(super.getAttribute(t)!==e&&(this._attrs.set(t,e),this._attributePriority.set(t,i),!0))}_removeAttribute(t,e=!0){const n=e?"normal":"low";return ("low"!=n||"normal"!=this._attributePriority.get(t))&&(this._attributePriority.set(t,n),!!super.hasAttribute(t)&&(this._attrs.delete(t),!0))}_setAttributesTo(t){const e=new Set;for(const[e,n]of this.getAttributes())t.get(e)!==n&&this._removeAttribute(e,!1);for(const[n,i]of t){this._setAttribute(n,i,!1)&&e.add(n);}return e}*_getStoredAttributes(){const t=this.getFirstPosition().parent;if(this.isCollapsed&&t.isEmpty)for(const e of t.getAttributeKeys())if(e.startsWith(ta)){yield [e.substr(ta.length),t.getAttribute(e)];}}_getSurroundingAttributes(){const t=this.getFirstPosition(),e=this._model.schema;let n=null;if(this.isCollapsed){const e=t.textNode?t.textNode:t.nodeBefore,i=t.textNode?t.textNode:t.nodeAfter;if(this.isGravityOverridden||(n=ia(e)),n||(n=ia(i)),!this.isGravityOverridden&&!n){let t=e;for(;t&&!n;)n=ia(t=t.previousSibling);}if(!n){let t=i;for(;t&&!n;)n=ia(t=t.nextSibling);}n||(n=this._getStoredAttributes());}else{const t=this.getFirstRange();for(const i of t){if(i.item.is("element")&&e.isObject(i.item))break;"text"==i.type&&null===n&&(n=i.item.getAttributes());}}return n}_fixGraveyardSelection(t,e){const n=e.clone(),i=this._model.schema.getNearestSelectionRange(n),o=this._ranges.indexOf(t);if(this._ranges.splice(o,1),t.detach(),i){const t=this._prepareRange(i);this._ranges.splice(o,0,t);}}}function ia(t){return t instanceof js||t instanceof Ls?t.getAttributes():null}var oa=1,ra=4;var sa=function(t){return oi(t,oa|ra)};function aa(t){return (t=sa(t)).view=da(t.view,"container"),e=>{e.on("insert:"+t.model,function(t){return (e,n,i)=>{const o=t(n.item,i.writer);if(!o)return;if(!i.consumable.consume(n.item,"insert"))return;const r=i.mapper.toViewPosition(n.range.start);i.mapper.bindElements(n.item,o),i.writer.insert(r,o);}}(t.view),{priority:t.converterPriority||"normal"});}}function ca(t){let e="attribute:"+((t=sa(t)).model.key?t.model.key:t.model);if(t.model.name&&(e+=":"+t.model.name),t.model.values)for(const e of t.model.values)t.view[e]=da(t.view[e],"attribute");else t.view=da(t.view,"attribute");const n=ua(t);return i=>{i.on(e,function(t){return (e,n,i)=>{const o=t(n.attributeOldValue,i.writer),r=t(n.attributeNewValue,i.writer);if(!o&&!r)return;if(!i.consumable.consume(n.item,e.name))return;const s=i.writer,a=s.document.selection;if(n.item instanceof Ks||n.item instanceof ea)s.wrap(a.getFirstRange(),r);else{let t=i.mapper.toViewRange(n.range);null!==n.attributeOldValue&&o&&(t=s.unwrap(t,o)),null!==n.attributeNewValue&&r&&s.wrap(t,r);}}}(n),{priority:t.converterPriority||"normal"});}}function la(t){let e="attribute:"+((t=sa(t)).model.key?t.model.key:t.model);if(t.model.name&&(e+=":"+t.model.name),t.model.values)for(const e of t.model.values)t.view[e]=ha(t.view[e]);else t.view=ha(t.view);const n=ua(t);return i=>{i.on(e,function(t){return t=t||((t,e)=>({value:t,key:e.attributeKey})),(e,n,i)=>{const o=t(n.attributeOldValue,n),r=t(n.attributeNewValue,n);if(!o&&!r)return;if(!i.consumable.consume(n.item,e.name))return;const s=i.mapper.toViewElement(n.item),a=i.writer;if(s){if(null!==n.attributeOldValue&&o)if("class"==o.key){const t=Array.isArray(o.value)?o.value:[o.value];for(const e of t)a.removeClass(e,s);}else if("style"==o.key){const t=Object.keys(o.value);for(const e of t)a.removeStyle(e,s);}else a.removeAttribute(o.key,s);if(null!==n.attributeNewValue&&r)if("class"==r.key){const t=Array.isArray(r.value)?r.value:[r.value];for(const e of t)a.addClass(e,s);}else if("style"==r.key){const t=Object.keys(r.value);for(const e of t)a.setStyle(e,r.value[e],s);}else a.setAttribute(r.key,r.value,s);}else fs.a.warn("conversion-attribute-to-attribute-on-text: Trying to convert text node's attribute with attribute-to-attribute converter.");}}(n),{priority:t.converterPriority||"normal"});}}function da(t,e){return "function"==typeof t?t:(n,i)=>(function(t,e,n){"string"==typeof t&&(t={name:t});let i;const o=Object.assign({},t.attributes);if("container"==n)i=e.createContainerElement(t.name,o);else if("attribute"==n){const n={priority:t.priority||no.DEFAULT_PRIORITY};i=e.createAttributeElement(t.name,o,n);}else i=e.createUIElement(t.name,o);if(t.styles){const n=Object.keys(t.styles);for(const o of n)e.setStyle(o,t.styles[o],i);}if(t.classes){const n=t.classes;if("string"==typeof n)e.addClass(n,i);else for(const t of n)e.addClass(t,i);}return i})(t,i,e)}function ua(t){return t.model.values?(e,n)=>{const i=t.view[e];return i?i(e,n):null}:t.view}function ha(t){return "string"==typeof t?e=>({key:t,value:e}):"object"==typeof t?t.value?()=>t:e=>({key:t.key,value:e}):t}class fa{constructor(t){this.model=t,this.view=new Os,this.mapper=new Ws,this.downcastDispatcher=new Gs({mapper:this.mapper});const e=this.model.document,n=e.selection,i=this.model.markers;this.listenTo(this.model,"_beforeChanges",()=>{this.view._renderingDisabled=!0;},{priority:"highest"}),this.listenTo(this.model,"_afterChanges",()=>{this.view._renderingDisabled=!1,this.view.render();},{priority:"lowest"}),this.listenTo(e,"change",()=>{this.view.change(t=>{this.downcastDispatcher.convertChanges(e.differ,t),this.downcastDispatcher.convertSelection(n,i,t);});},{priority:"low"}),this.listenTo(this.view.document,"selectionChange",function(t,e){return (n,i)=>{const o=i.newSelection,r=new Ks,s=[];for(const t of o.getRanges())s.push(e.toModelRange(t));r.setTo(s,{backward:o.isBackward}),r.isEqual(t.document.selection)||t.change(t=>{t.setSelection(r);});}}(this.model,this.mapper)),this.downcastDispatcher.on("insert:$text",(t,e,n)=>{if(!n.consumable.consume(e.item,"insert"))return;const i=n.writer,o=n.mapper.toViewPosition(e.range.start),r=i.createText(e.item.data);i.insert(o,r);},{priority:"lowest"}),this.downcastDispatcher.on("remove",(t,e,n)=>{const i=n.mapper.toViewPosition(e.position),o=e.position.getShiftedBy(e.length),r=n.mapper.toViewPosition(o,{isPhantom:!0}),s=n.writer.createRange(i,r),a=n.writer.remove(s.getTrimmed());for(const t of n.writer.createRangeIn(a).getItems())n.mapper.unbindViewElement(t);},{priority:"low"}),this.downcastDispatcher.on("selection",(t,e,n)=>{const i=n.writer,o=i.document.selection;for(const t of o.getRanges())t.isCollapsed&&t.end.parent.document&&n.writer.mergeAttributes(t.start);i.setSelection(null);},{priority:"low"}),this.downcastDispatcher.on("selection",(t,e,n)=>{const i=e.selection;if(i.isCollapsed)return;if(!n.consumable.consume(i,"selection"))return;const o=[];for(const t of i.getRanges()){const e=n.mapper.toViewRange(t);o.push(e);}n.writer.setSelection(o,{backward:i.isBackward});},{priority:"low"}),this.downcastDispatcher.on("selection",(t,e,n)=>{const i=e.selection;if(!i.isCollapsed)return;if(!n.consumable.consume(i,"selection"))return;const o=n.writer,r=i.getFirstPosition(),s=n.mapper.toViewPosition(r),a=o.breakAttributes(s);o.setSelection(a);},{priority:"low"}),this.view.document.roots.bindTo(this.model.document.roots).using(t=>{if("$graveyard"==t.rootName)return null;const e=new Wi(t.name);return e.rootName=t.rootName,e._document=this.view.document,this.mapper.bindElements(t,e),e});}destroy(){this.view.destroy(),this.stopListening();}}F(fa,Li);class ma{constructor(t,e=[]){this._editor=t,this._availablePlugins=new Map,this._plugins=new Map;for(const t of e)this._availablePlugins.set(t,t),t.pluginName&&this._availablePlugins.set(t.pluginName,t);}*[Symbol.iterator](){for(const t of this._plugins)"function"==typeof t[0]&&(yield t);}get(t){return this._plugins.get(t)}load(t,e=[]){const n=this,i=this._editor,o=new Set,r=[],s=u(t),a=u(e),c=function(t){const e=[];for(const n of t)d(n)||e.push(n);return e.length?e:null}(t);if(c){const t="plugincollection-plugin-not-found: Some plugins are not available and could not be loaded.";return fs.a.error(t,{plugins:c}),Promise.reject(new P.b(t,{plugins:c}))}return Promise.all(s.map(l)).then(()=>r);function l(t){if(!a.includes(t)&&!n.get(t)&&!o.has(t))return function(t){return new Promise(s=>{o.add(t),t.requires&&t.requires.forEach(n=>{const i=d(n);if(e.includes(i))throw new P.b("plugincollection-required: Cannot load a plugin because one of its dependencies is listed inthe `removePlugins` option.",{plugin:i,requiredBy:t});l(i);});const a=new t(i);n._add(t,a),r.push(a),s();})}(t).catch(e=>{throw fs.a.error("plugincollection-load: It was not possible to load the plugin.",{plugin:t}),e})}function d(t){return "function"==typeof t?t:n._availablePlugins.get(t)}function u(t){return t.map(t=>d(t)).filter(t=>!!t)}}destroy(){const t=Array.from(this).map(([,t])=>t).filter(t=>"function"==typeof t.destroy).map(t=>t.destroy());return Promise.all(t)}_add(t,e){this._plugins.set(t,e);const n=t.pluginName;n&&(this._plugins.has(n)?fs.a.warn("plugincollection-plugin-name-conflict: Two plugins with the same name were loaded.",{pluginName:n,plugin1:this._plugins.get(n).constructor,plugin2:t}):this._plugins.set(n,e));}}class ga{constructor(){this._commands=new Map;}add(t,e){this._commands.set(t,e);}get(t){return this._commands.get(t)}execute(t,...e){const n=this.get(t);if(!n)throw new P.b("commandcollection-command-not-found: Command does not exist.",{commandName:t});n.execute(...e);}*names(){yield*this._commands.keys();}*commands(){yield*this._commands.values();}[Symbol.iterator](){return this._commands[Symbol.iterator]()}destroy(){for(const t of this.commands())t.destroy();}}function pa(t,e){const n=Object.keys(window.CKEDITOR_TRANSLATIONS).length;return 1===n&&(t=Object.keys(window.CKEDITOR_TRANSLATIONS)[0]),0!==n&&function(t,e){return t in window.CKEDITOR_TRANSLATIONS&&e in window.CKEDITOR_TRANSLATIONS[t]}(t,e)?window.CKEDITOR_TRANSLATIONS[t][e].replace(/ \[context: [^\]]+\]$/,""):e.replace(/ \[context: [^\]]+\]$/,"")}window.CKEDITOR_TRANSLATIONS||(window.CKEDITOR_TRANSLATIONS={});class ba{constructor(t){this.language=t||"en",this.t=((...t)=>this._t(...t));}_t(t,e){let n=pa(this.language,t);return e&&(n=n.replace(/%(\d+)/g,(t,n)=>n<e.length?e[n]:t)),n}}class wa{constructor(){this._consumables=new Map;}add(t,e){let n;t.is("text")||t.is("documentFragment")?this._consumables.set(t,!0):(this._consumables.has(t)?n=this._consumables.get(t):(n=new _a,this._consumables.set(t,n)),n.add(e));}test(t,e){const n=this._consumables.get(t);return void 0===n?null:t.is("text")||t.is("documentFragment")?n:n.test(e)}consume(t,e){return !!this.test(t,e)&&(t.is("text")||t.is("documentFragment")?this._consumables.set(t,!1):this._consumables.get(t).consume(e),!0)}revert(t,e){const n=this._consumables.get(t);void 0!==n&&(t.is("text")||t.is("documentFragment")?this._consumables.set(t,!0):n.revert(e));}static consumablesFromElement(t){const e={name:!0,attributes:[],classes:[],styles:[]},n=t.getAttributeKeys();for(const t of n)"style"!=t&&"class"!=t&&e.attributes.push(t);const i=t.getClassNames();for(const t of i)e.classes.push(t);const o=t.getStyleNames();for(const t of o)e.styles.push(t);return e}static createFrom(t,e){if(e||(e=new wa),t.is("text"))return e.add(t),e;t.is("element")&&e.add(t,wa.consumablesFromElement(t)),t.is("documentFragment")&&e.add(t);for(const n of t.getChildren())e=wa.createFrom(n,e);return e}}class _a{constructor(){this._canConsumeName=null,this._consumables={attributes:new Map,styles:new Map,classes:new Map};}add(t){t.name&&(this._canConsumeName=!0);for(const e in this._consumables)e in t&&this._add(e,t[e]);}test(t){if(t.name&&!this._canConsumeName)return this._canConsumeName;for(const e in this._consumables)if(e in t){const n=this._test(e,t[e]);if(!0!==n)return n}return !0}consume(t){t.name&&(this._canConsumeName=!1);for(const e in this._consumables)e in t&&this._consume(e,t[e]);}revert(t){t.name&&(this._canConsumeName=!0);for(const e in this._consumables)e in t&&this._revert(e,t[e]);}_add(t,e){const n=ce(e)?e:[e],i=this._consumables[t];for(const e of n){if("attributes"===t&&("class"===e||"style"===e))throw new P.b("viewconsumable-invalid-attribute: Classes and styles should be handled separately.");i.set(e,!0);}}_test(t,e){const n=ce(e)?e:[e],i=this._consumables[t];for(const e of n)if("attributes"!==t||"class"!==e&&"style"!==e){const t=i.get(e);if(void 0===t)return null;if(!t)return !1}else{const t="class"==e?"classes":"styles",n=this._test(t,[...this._consumables[t].keys()]);if(!0!==n)return n}return !0}_consume(t,e){const n=ce(e)?e:[e],i=this._consumables[t];for(const e of n)if("attributes"!==t||"class"!==e&&"style"!==e)i.set(e,!1);else{const t="class"==e?"classes":"styles";this._consume(t,[...this._consumables[t].keys()]);}}_revert(t,e){const n=ce(e)?e:[e],i=this._consumables[t];for(const e of n)if("attributes"!==t||"class"!==e&&"style"!==e){!1===i.get(e)&&i.set(e,!0);}else{const t="class"==e?"classes":"styles";this._revert(t,[...this._consumables[t].keys()]);}}}class ka{constructor(){this._sourceDefinitions={},this.decorate("checkChild"),this.decorate("checkAttribute"),this.on("checkAttribute",(t,e)=>{e[0]=new va(e[0]);},{priority:"highest"}),this.on("checkChild",(t,e)=>{e[0]=new va(e[0]),e[1]=this.getDefinition(e[1]);},{priority:"highest"});}register(t,e){if(this._sourceDefinitions[t])throw new P.b("schema-cannot-register-item-twice: A single item cannot be registered twice in the schema.",{itemName:t});this._sourceDefinitions[t]=[Object.assign({},e)],this._clearCache();}extend(t,e){if(!this._sourceDefinitions[t])throw new P.b("schema-cannot-extend-missing-item: Cannot extend an item which was not registered yet.",{itemName:t});this._sourceDefinitions[t].push(Object.assign({},e)),this._clearCache();}getDefinitions(){return this._compiledDefinitions||this._compile(),this._compiledDefinitions}getDefinition(t){let e;return e="string"==typeof t?t:t.is&&(t.is("text")||t.is("textProxy"))?"$text":t.name,this.getDefinitions()[e]}isRegistered(t){return !!this.getDefinition(t)}isBlock(t){const e=this.getDefinition(t);return !(!e||!e.isBlock)}isLimit(t){const e=this.getDefinition(t);return !!e&&!(!e.isLimit&&!e.isObject)}isObject(t){const e=this.getDefinition(t);return !(!e||!e.isObject)}checkChild(t,e){return !!e&&this._checkContextMatch(e,t)}checkAttribute(t,e){const n=this.getDefinition(t.last);return !!n&&n.allowAttributes.includes(e)}checkMerge(t,e=null){if(t instanceof Hs){const e=t.nodeBefore,n=t.nodeAfter;if(!(e instanceof zs))throw new P.b("schema-check-merge-no-element-before: The node before the merge position must be an element.");if(!(n instanceof zs))throw new P.b("schema-check-merge-no-element-after: The node after the merge position must be an element.");return this.checkMerge(e,n)}for(const n of e.getChildren())if(!this.checkChild(t,n))return !1;return !0}addChildCheck(t){this.on("checkChild",(e,[n,i])=>{if(!i)return;const o=t(n,i);"boolean"==typeof o&&(e.stop(),e.return=o);},{priority:"high"});}addAttributeCheck(t){this.on("checkAttribute",(e,[n,i])=>{const o=t(n,i);"boolean"==typeof o&&(e.stop(),e.return=o);},{priority:"high"});}getLimitElement(t){let e;if(t instanceof Hs)e=t.parent;else{e=(t instanceof qs?[t]:Array.from(t.getRanges())).reduce((t,e)=>{const n=e.getCommonAncestor();return t?t.getCommonAncestor(n,{includeSelf:!0}):n},null);}for(;!this.isLimit(e)&&e.parent;)e=e.parent;return e}checkAttributeInSelection(t,e){if(t.isCollapsed){const n=[...t.getFirstPosition().getAncestors(),new Ls("",t.getAttributes())];return this.checkAttribute(n,e)}{const n=t.getRanges();for(const t of n)for(const n of t)if(this.checkAttribute(n.item,e))return !0}return !1}*getValidRanges(t,e){t=function*(t){for(const e of t)yield*e.getMinimalFlatRanges();}(t);for(const n of t)yield*this._getValidRangesForRange(n,e);}*_getValidRangesForRange(t,e){let n=t.start,i=t.start;for(const o of t.getItems({shallow:!0}))o.is("element")&&(yield*this._getValidRangesForRange(qs._createIn(o),e)),this.checkAttribute(o,e)||(n.isEqual(i)||(yield new qs(n,i)),n=Hs._createAfter(o)),i=Hs._createAfter(o);n.isEqual(i)||(yield new qs(n,i));}getNearestSelectionRange(t,e="both"){if(this.checkChild(t,"$text"))return new qs(t);let n,i;"both"!=e&&"backward"!=e||(n=new Bs({startPosition:t,direction:"backward"})),"both"!=e&&"forward"!=e||(i=new Bs({startPosition:t}));for(const t of function*(t,e){let n=!1;for(;!n;){if(n=!0,t){const e=t.next();e.done||(n=!1,yield {walker:t,value:e.value});}if(e){const t=e.next();t.done||(n=!1,yield {walker:e,value:t.value});}}}(n,i)){const e=t.walker==n?"elementEnd":"elementStart",i=t.value;if(i.type==e&&this.isObject(i.item))return qs._createOn(i.item);if(this.checkChild(i.nextPosition,"$text"))return new qs(i.nextPosition)}return null}findAllowedParent(t,e){let n=e.parent;for(;n;){if(this.checkChild(n,t))return n;if(this.isLimit(n))return null;n=n.parent;}return null}removeDisallowedAttributes(t,e){for(const n of t){for(const t of n.getAttributeKeys())this.checkAttribute(n,t)||e.removeAttribute(t,n);n.is("element")&&this.removeDisallowedAttributes(n.getChildren(),e);}}createContext(t){return new va(t)}_clearCache(){this._compiledDefinitions=null;}_compile(){const t={},e=this._sourceDefinitions,n=Object.keys(e);for(const i of n)t[i]=ya(e[i],i);for(const e of n)xa(t,e);for(const e of n)Aa(t,e);for(const e of n)Ca(t,e),Ta(t,e);for(const e of n)Pa(t,e),Ma(t,e);this._compiledDefinitions=t;}_checkContextMatch(t,e,n=e.length-1){const i=e.getItem(n);if(t.allowIn.includes(i.name)){if(0==n)return !0;{const t=this.getDefinition(i);return this._checkContextMatch(t,e,n-1)}}return !1}}F(ka,Li);class va{constructor(t){if(t instanceof va)return t;"string"==typeof t?t=[t]:Array.isArray(t)||(t=t.getAncestors({includeSelf:!0})),t[0]&&"string"!=typeof t[0]&&t[0].is("documentFragment")&&t.shift(),this._items=t.map(Ea);}get length(){return this._items.length}get last(){return this._items[this._items.length-1]}[Symbol.iterator](){return this._items[Symbol.iterator]()}push(t){const e=new va([t]);return e._items=[...this._items,...e._items],e}getItem(t){return this._items[t]}*getNames(){yield*this._items.map(t=>t.name);}endsWith(t){return Array.from(this.getNames()).join(" ").endsWith(t)}}function ya(t,e){const n={name:e,allowIn:[],allowContentOf:[],allowWhere:[],allowAttributes:[],allowAttributesOf:[],inheritTypesFrom:[]};return function(t,e){for(const n of t){const t=Object.keys(n).filter(t=>t.startsWith("is"));for(const i of t)e[i]=n[i];}}(t,n),Sa(t,n,"allowIn"),Sa(t,n,"allowContentOf"),Sa(t,n,"allowWhere"),Sa(t,n,"allowAttributes"),Sa(t,n,"allowAttributesOf"),Sa(t,n,"inheritTypesFrom"),function(t,e){for(const n of t){const t=n.inheritAllFrom;t&&(e.allowContentOf.push(t),e.allowWhere.push(t),e.allowAttributesOf.push(t),e.inheritTypesFrom.push(t));}}(t,n),n}function xa(t,e){for(const n of t[e].allowContentOf)if(t[n]){Ia(t,n).forEach(t=>{t.allowIn.push(e);});}delete t[e].allowContentOf;}function Aa(t,e){for(const n of t[e].allowWhere){const i=t[n];if(i){const n=i.allowIn;t[e].allowIn.push(...n);}}delete t[e].allowWhere;}function Ca(t,e){for(const n of t[e].allowAttributesOf){const i=t[n];if(i){const n=i.allowAttributes;t[e].allowAttributes.push(...n);}}delete t[e].allowAttributesOf;}function Ta(t,e){const n=t[e];for(const e of n.inheritTypesFrom){const i=t[e];if(i){const t=Object.keys(i).filter(t=>t.startsWith("is"));for(const e of t)e in n||(n[e]=i[e]);}}delete n.inheritTypesFrom;}function Pa(t,e){const n=t[e],i=n.allowIn.filter(e=>t[e]);n.allowIn=Array.from(new Set(i));}function Ma(t,e){const n=t[e];n.allowAttributes=Array.from(new Set(n.allowAttributes));}function Sa(t,e,n){for(const i of t)"string"==typeof i[n]?e[n].push(i[n]):Array.isArray(i[n])&&e[n].push(...i[n]);}function Ia(t,e){const n=t[e];return function(t){return Object.keys(t).map(e=>t[e])}(t).filter(t=>t.allowIn.includes(n.name))}function Ea(t){return "string"==typeof t?{name:t,*getAttributeKeys(){},getAttribute(){}}:{name:t.is("element")?t.name:"$text",*getAttributeKeys(){yield*t.getAttributeKeys();},getAttribute:e=>t.getAttribute(e)}}class Na{constructor(t={}){this._removeIfEmpty=new Set,this._modelCursor=null,this.conversionApi=Object.assign({},t),this.conversionApi.convertItem=this._convertItem.bind(this),this.conversionApi.convertChildren=this._convertChildren.bind(this),this.conversionApi.splitToAllowedParent=this._splitToAllowedParent.bind(this);}convert(t,e,n=["$root"]){this.fire("viewCleanup",t),this._modelCursor=function(t,e){let n;for(const i of new va(t)){const t={};for(const e of i.getAttributeKeys())t[e]=i.getAttribute(e);const o=e.createElement(i.name,t);n&&e.append(o,n),n=Hs._createAt(o,0);}return n}(n,e),this.conversionApi.writer=e,this.conversionApi.consumable=wa.createFrom(t),this.conversionApi.store={};const{modelRange:i}=this._convertItem(t,this._modelCursor),o=e.createDocumentFragment();if(i){this._removeEmptyElements();for(const t of Array.from(this._modelCursor.parent.getChildren()))e.append(t,o);o.markers=function(t,e){const n=new Set,i=new Map,o=qs._createIn(t).getItems();for(const t of o)"$marker"==t.name&&n.add(t);for(const t of n){const n=t.getAttribute("data-name"),o=e.createPositionBefore(t);i.has(n)?i.get(n).end=o.clone():i.set(n,new qs(o.clone())),e.remove(t);}return i}(o,e);}return this._modelCursor=null,this._removeIfEmpty.clear(),this.conversionApi.writer=null,this.conversionApi.store=null,o}_convertItem(t,e){const n=Object.assign({viewItem:t,modelCursor:e,modelRange:null});if(t.is("element")?this.fire("element:"+t.name,n,this.conversionApi):t.is("text")?this.fire("text",n,this.conversionApi):this.fire("documentFragment",n,this.conversionApi),n.modelRange&&!(n.modelRange instanceof qs))throw new P.b("view-conversion-dispatcher-incorrect-result: Incorrect conversion result was dropped.");return {modelRange:n.modelRange,modelCursor:n.modelCursor}}_convertChildren(t,e){const n=new qs(e);let i=e;for(const e of Array.from(t.getChildren())){const t=this._convertItem(e,i);t.modelRange instanceof qs&&(n.end=t.modelRange.end,i=t.modelCursor);}return {modelRange:n,modelCursor:i}}_splitToAllowedParent(t,e){const n=this.conversionApi.schema.findAllowedParent(t,e);if(!n)return null;if(n===e.parent)return {position:e};if(this._modelCursor.parent.getAncestors().includes(n))return null;const i=this.conversionApi.writer.split(e,n);for(const t of i.range.getPositions())t.isEqual(i.position)||this._removeIfEmpty.add(t.parent);return {position:i.position,cursorParent:i.range.end.parent}}_removeEmptyElements(){let t=!1;for(const e of this._removeIfEmpty)e.isEmpty&&(this.conversionApi.writer.remove(e),this._removeIfEmpty.delete(e),t=!0);t&&this._removeEmptyElements();}}function Oa(t){const e=function(t){const e=new hi(t.view);return (n,i,o)=>{const r=e.match(i.viewItem);if(!r)return;r.match.name=!0;const s=function(t,e,n){return t instanceof Function?t(e,n):n.createElement(t)}(t.model,i.viewItem,o.writer);if(!s)return;if(!o.consumable.test(i.viewItem,r.match))return;const a=o.splitToAllowedParent(s,i.modelCursor);if(!a)return;o.writer.insert(s,a.position);const c=o.convertChildren(i.viewItem,o.writer.createPositionAt(s,0));o.consumable.consume(i.viewItem,r.match),i.modelRange=new qs(o.writer.createPositionBefore(s),o.writer.createPositionAfter(c.modelCursor.parent)),a.cursorParent?i.modelCursor=o.writer.createPositionAt(a.cursorParent,0):i.modelCursor=i.modelRange.end;}}(t=sa(t)),n=La(t),i=n?"element:"+n:"element";return n=>{n.on(i,e,{priority:t.converterPriority||"normal"});}}function Ra(t){ja(t=sa(t));const e=Va(t,!1),n=La(t),i=n?"element:"+n:"element";return n=>{n.on(i,e,{priority:t.converterPriority||"normal"});}}function Da(t){let e=null;("string"==typeof(t=sa(t)).view||t.view.key)&&(e=function(t){"string"==typeof t.view&&(t.view={key:t.view});const e=t.view.key;let n;if("class"==e||"style"==e){const i="class"==e?"classes":"styles";n={[i]:t.view.value};}else{const i=void 0===t.view.value?/[\s\S]*/:t.view.value;n={attributes:{[e]:i}};}t.view.name&&(n.name=t.view.name);return t.view=n,e}(t)),ja(t,e);const n=Va(t,!0);return e=>{e.on("element",n,{priority:t.converterPriority||"low"});}}function La(t){return "string"==typeof t.view?t.view:"object"==typeof t.view&&"string"==typeof t.view.name?t.view.name:null}function ja(t,e=null){const n=null===e||(t=>t.getAttribute(e)),i="object"!=typeof t.model?t.model:t.model.key,o="object"!=typeof t.model||void 0===t.model.value?n:t.model.value;t.model={key:i,value:o};}function Va(t,e){const n=new hi(t.view);return (i,o,r)=>{const s=n.match(o.viewItem);if(!s)return;const a=t.model.key,c="function"==typeof t.model.value?t.model.value(o.viewItem):t.model.value;null!==c&&(!function(t){if("object"==typeof t.view&&!La(t))return !1;return !t.view.classes&&!t.view.attributes&&!t.view.styles}(t)?delete s.match.name:s.match.name=!0,r.consumable.test(o.viewItem,s.match)&&(o.modelRange||(o=Object.assign(o,r.convertChildren(o.viewItem,o.modelCursor))),function(t,e,n,i){let o=!1;for(const r of Array.from(t.getItems({shallow:n})))i.schema.checkAttribute(r,e.key)&&(i.writer.setAttribute(e.key,e.value,r),o=!0);return o}(o.modelRange,{key:a,value:c},e,r)&&r.consumable.consume(o.viewItem,s.match)));}}F(Na,R);class za{constructor(t,e){this.model=t,this.processor=e,this.mapper=new Ws,this.downcastDispatcher=new Gs({mapper:this.mapper}),this.downcastDispatcher.on("insert:$text",(t,e,n)=>{if(!n.consumable.consume(e.item,"insert"))return;const i=n.writer,o=n.mapper.toViewPosition(e.range.start),r=i.createText(e.item.data);i.insert(o,r);},{priority:"lowest"}),this.upcastDispatcher=new Na({schema:t.schema}),this.upcastDispatcher.on("text",(t,e,n)=>{if(n.schema.checkChild(e.modelCursor,"$text")&&n.consumable.consume(e.viewItem)){const t=n.writer.createText(e.viewItem.data);n.writer.insert(t,e.modelCursor),e.modelRange=qs._createFromPositionAndShift(e.modelCursor,t.offsetSize),e.modelCursor=e.modelRange.end;}},{priority:"lowest"}),this.upcastDispatcher.on("element",(t,e,n)=>{if(!e.modelRange&&n.consumable.consume(e.viewItem,{name:!0})){const{modelRange:t,modelCursor:i}=n.convertChildren(e.viewItem,e.modelCursor);e.modelRange=t,e.modelCursor=i;}},{priority:"lowest"}),this.upcastDispatcher.on("documentFragment",(t,e,n)=>{if(!e.modelRange&&n.consumable.consume(e.viewItem,{name:!0})){const{modelRange:t,modelCursor:i}=n.convertChildren(e.viewItem,e.modelCursor);e.modelRange=t,e.modelCursor=i;}},{priority:"lowest"}),this.decorate("init");}get(t="main"){return this.stringify(this.model.document.getRoot(t))}stringify(t){const e=this.toView(t);return this.processor.toData(e)}toView(t){this.mapper.clearBindings();const e=qs._createIn(t),n=new _o,i=new ko(new to);if(this.mapper.bindElements(t,n),this.downcastDispatcher.convertInsert(e,i),!t.is("documentFragment")){const e=function(t){const e=[],n=t.root.document;if(!n)return [];const i=qs._createIn(t);for(const t of n.model.markers){const n=i.getIntersection(t.getRange());n&&e.push([t.name,n]);}return e}(t);for(const[t,n]of e)this.downcastDispatcher.convertMarkerAdd(t,n,i);}return n}init(t,e="main"){if(this.model.document.version)throw new P.b("datacontroller-init-document-not-empty: Trying to set initial data to not empty document.");const n=this.model.document.getRoot(e);return this.model.enqueueChange("transparent",e=>{e.insert(this.parse(t,n),n,0);}),Promise.resolve()}set(t,e="main"){const n=this.model.document.getRoot(e);this.model.enqueueChange("transparent",e=>{e.setSelection(null),e.removeSelectionAttribute(this.model.document.selection.getAttributeKeys()),e.remove(e.createRangeIn(n)),e.insert(this.parse(t,n),n,0);});}parse(t,e="$root"){const n=this.processor.toView(t);return this.toModel(n,e)}toModel(t,e="$root"){return this.model.change(n=>this.upcastDispatcher.convert(t,n,e))}destroy(){}}F(za,Li);class Ba{constructor(){this._dispatchersGroups=new Map;}register(t,e){if(this._dispatchersGroups.has(t))throw new P.b("conversion-register-group-exists: Trying to register a group name that was already registered.");this._dispatchersGroups.set(t,e);}for(t){const e=this._getDispatchers(t);return {add(t){return function(t,e){for(const n of t)e(n);}(e,t),this}}}elementToElement(t){this.for("downcast").add(aa(t));for(const{model:e,view:n}of Fa(t))this.for("upcast").add(Oa({model:e,view:n,converterPriority:t.converterPriority}));}attributeToElement(t){this.for("downcast").add(ca(t));for(const{model:e,view:n}of Fa(t))this.for("upcast").add(Ra({view:n,model:e,priority:t.priority}));}attributeToAttribute(t){this.for("downcast").add(la(t));for(const{model:e,view:n}of Fa(t))this.for("upcast").add(Da({view:n,model:e}));}_getDispatchers(t){const e=this._dispatchersGroups.get(t);if(!e)throw new P.b("conversion-for-unknown-group: Trying to add a converter to an unknown dispatchers group.");return e}}function*Fa(t){if(t.model.values)for(const e of t.model.values){yield*Ua({key:t.model.key,value:e},t.view[e],t.upcastAlso?t.upcastAlso[e]:void 0);}else yield*Ua(t.model,t.view,t.upcastAlso);}function*Ua(t,e,n){if(yield {model:t,view:e},n){n=Array.isArray(n)?n:[n];for(const e of n)yield {model:t,view:e};}}class Ha{constructor(t="default"){this.operations=[],this.type=t;}get baseVersion(){for(const t of this.operations)if(null!==t.baseVersion)return t.baseVersion;return null}addOperation(t){return t.batch=this,this.operations.push(t),t}}class qa{constructor(t){this.baseVersion=t,this.isDocumentOperation=null!==this.baseVersion,this.batch=null;}_validate(){}toJSON(){const t=Object.assign({},this);return t.__className=this.constructor.className,delete t.batch,delete t.isDocumentOperation,t}static get className(){return "Operation"}static fromJSON(t){return new this(t.baseVersion)}}class Wa{constructor(t){this.markers=new Map,this._children=new Vs,t&&this._insertChild(0,t);}[Symbol.iterator](){return this.getChildren()}get childCount(){return this._children.length}get maxOffset(){return this._children.maxOffset}get isEmpty(){return 0===this.childCount}get root(){return this}get parent(){return null}is(t){return "documentFragment"==t}getChild(t){return this._children.getNode(t)}getChildren(){return this._children[Symbol.iterator]()}getChildIndex(t){return this._children.getNodeIndex(t)}getChildStartOffset(t){return this._children.getNodeStartOffset(t)}getPath(){return []}getNodeByPath(t){let e=this;for(const n of t)e=e.getChild(e.offsetToIndex(n));return e}offsetToIndex(t){return this._children.offsetToIndex(t)}toJSON(){const t=[];for(const e of this._children)t.push(e.toJSON());return t}static fromJSON(t){const e=[];for(const n of t)n.name?e.push(zs.fromJSON(n)):e.push(Ls.fromJSON(n));return new Wa(e)}_appendChild(t){this._insertChild(this.childCount,t);}_insertChild(t,e){const n=function(t){if("string"==typeof t)return [new Ls(t)];ui(t)||(t=[t]);return Array.from(t).map(t=>"string"==typeof t?new Ls(t):t instanceof js?new Ls(t.data,t.getAttributes()):t)}(e);for(const t of n)null!==t.parent&&t._remove(),t.parent=this;this._children._insertNodes(t,n);}_removeChildren(t,e=1){const n=this._children._removeNodes(t,e);for(const t of n)t.parent=null;return n}}function Ya(t,e){const n=(e=Qa(e)).reduce((t,e)=>t+e.offsetSize,0),i=t.parent;Ja(t);const o=t.index;return i._insertChild(o,e),Ka(i,o+e.length),Ka(i,o),new qs(t,t.getShiftedBy(n))}function $a(t){if(!t.isFlat)throw new P.b("operation-utils-remove-range-not-flat: Trying to remove a range which starts and ends in different element.");const e=t.start.parent;Ja(t.start),Ja(t.end);const n=e._removeChildren(t.start.index,t.end.index-t.start.index);return Ka(e,t.start.index),n}function Ga(t,e){if(!t.isFlat)throw new P.b("operation-utils-move-range-not-flat: Trying to move a range which starts and ends in different element.");const n=$a(t);return Ya(e=e._getTransformedByDeletion(t.start,t.end.offset-t.start.offset),n)}function Qa(t){const e=[];t instanceof Array||(t=[t]);for(let n=0;n<t.length;n++)if("string"==typeof t[n])e.push(new Ls(t[n]));else if(t[n]instanceof js)e.push(new Ls(t[n].data,t[n].getAttributes()));else if(t[n]instanceof Wa||t[n]instanceof Vs)for(const i of t[n])e.push(i);else t[n]instanceof Ds&&e.push(t[n]);for(let t=1;t<e.length;t++){const n=e[t],i=e[t-1];n instanceof Ls&&i instanceof Ls&&Za(n,i)&&(e.splice(t-1,2,new Ls(i.data+n.data,i.getAttributes())),t--);}return e}function Ka(t,e){const n=t.getChild(e-1),i=t.getChild(e);if(n&&i&&n.is("text")&&i.is("text")&&Za(n,i)){const o=new Ls(n.data+i.data,n.getAttributes());t._removeChildren(e-1,2),t._insertChild(e-1,o);}}function Ja(t){const e=t.textNode,n=t.parent;if(e){const i=t.offset-e.startOffset,o=e.index;n._removeChildren(o,1);const r=new Ls(e.data.substr(0,i),e.getAttributes()),s=new Ls(e.data.substr(i),e.getAttributes());n._insertChild(o,[r,s]);}}function Za(t,e){const n=t.getAttributes(),i=e.getAttributes();for(const t of n){if(t[1]!==e.getAttribute(t[0]))return !1;i.next();}return i.next().done}var Xa=function(t,e){return Yr(t,e)};class tc extends qa{constructor(t,e,n,i,o){super(o),this.range=t.clone(),this.key=e,this.oldValue=void 0===n?null:n,this.newValue=void 0===i?null:i;}get type(){return null===this.oldValue?"addAttribute":null===this.newValue?"removeAttribute":"changeAttribute"}clone(){return new tc(this.range,this.key,this.oldValue,this.newValue,this.baseVersion)}getReversed(){return new tc(this.range,this.key,this.newValue,this.oldValue,this.baseVersion+1)}toJSON(){const t=super.toJSON();return t.range=this.range.toJSON(),t}_validate(){if(!this.range.isFlat)throw new P.b("attribute-operation-range-not-flat: The range to change is not flat.");for(const t of this.range.getItems({shallow:!0})){if(null!==this.oldValue&&!Xa(t.getAttribute(this.key),this.oldValue))throw new P.b("attribute-operation-wrong-old-value: Changed node has different attribute value than operation's old attribute value.",{item:t,key:this.key,value:this.oldValue});if(null===this.oldValue&&null!==this.newValue&&t.hasAttribute(this.key))throw new P.b("attribute-operation-attribute-exists: The attribute with given key already exists.",{node:t,key:this.key})}}_execute(){Xa(this.oldValue,this.newValue)||function(t,e,n){Ja(t.start),Ja(t.end);for(const i of t.getItems({shallow:!0})){const t=i.is("textProxy")?i.textNode:i;null!==n?t._setAttribute(e,n):t._removeAttribute(e),Ka(t.parent,t.index);}Ka(t.end.parent,t.end.index);}(this.range,this.key,this.newValue);}static get className(){return "AttributeOperation"}static fromJSON(t,e){return new tc(qs.fromJSON(t.range,e),t.key,t.oldValue,t.newValue,t.baseVersion)}}class ec extends qa{constructor(t,e){super(null),this.sourcePosition=t.clone(),this.howMany=e;}get type(){return "detach"}toJSON(){const t=super.toJSON();return t.sourcePosition=this.sourcePosition.toJSON(),t}_validate(){if(this.sourcePosition.root.document)throw new P.b("detach-operation-on-document-node: Cannot detach document node.")}_execute(){$a(qs._createFromPositionAndShift(this.sourcePosition,this.howMany));}static get className(){return "DetachOperation"}}class nc extends qa{constructor(t,e,n,i){super(i),this.sourcePosition=t.clone(),this.sourcePosition.stickiness="toNext",this.howMany=e,this.targetPosition=n.clone(),this.targetPosition.stickiness="toNone";}get type(){return "$graveyard"==this.targetPosition.root.rootName?"remove":"$graveyard"==this.sourcePosition.root.rootName?"reinsert":"move"}clone(){return new this.constructor(this.sourcePosition,this.howMany,this.targetPosition,this.baseVersion)}getMovedRangeStart(){return this.targetPosition._getTransformedByDeletion(this.sourcePosition,this.howMany)}getReversed(){const t=this.sourcePosition._getTransformedByInsertion(this.targetPosition,this.howMany);return new this.constructor(this.getMovedRangeStart(),this.howMany,t,this.baseVersion+1)}_validate(){const t=this.sourcePosition.parent,e=this.targetPosition.parent,n=this.sourcePosition.offset,i=this.targetPosition.offset;if(!t||!e)throw new P.b("move-operation-position-invalid: Source position or target position is invalid.");if(n+this.howMany>t.maxOffset)throw new P.b("move-operation-nodes-do-not-exist: The nodes which should be moved do not exist.");if(t===e&&n<i&&i<n+this.howMany)throw new P.b("move-operation-range-into-itself: Trying to move a range of nodes to the inside of that range.");if(this.sourcePosition.root==this.targetPosition.root&&"prefix"==U(this.sourcePosition.getParentPath(),this.targetPosition.getParentPath())){const t=this.sourcePosition.path.length-1;if(this.targetPosition.path[t]>=n&&this.targetPosition.path[t]<n+this.howMany)throw new P.b("move-operation-node-into-itself: Trying to move a range of nodes into one of nodes from that range.")}}_execute(){Ga(qs._createFromPositionAndShift(this.sourcePosition,this.howMany),this.targetPosition);}toJSON(){const t=super.toJSON();return t.sourcePosition=this.sourcePosition.toJSON(),t.targetPosition=this.targetPosition.toJSON(),t}static get className(){return "MoveOperation"}static fromJSON(t,e){const n=Hs.fromJSON(t.sourcePosition,e),i=Hs.fromJSON(t.targetPosition,e);return new this(n,t.howMany,i,t.baseVersion)}}class ic extends qa{constructor(t,e,n){super(n),this.position=t.clone(),this.position.stickiness="toNone",this.nodes=new Vs(Qa(e)),this.shouldReceiveAttributes=!1;}get type(){return "insert"}get howMany(){return this.nodes.maxOffset}clone(){const t=new Vs([...this.nodes].map(t=>t._clone(!0))),e=new ic(this.position,t,this.baseVersion);return e.shouldReceiveAttributes=this.shouldReceiveAttributes,e}getReversed(){const t=this.position.root.document.graveyard,e=new Hs(t,[0]);return new nc(this.position,this.nodes.maxOffset,e,this.baseVersion+1)}_validate(){const t=this.position.parent;if(!t||t.maxOffset<this.position.offset)throw new P.b("insert-operation-position-invalid: Insertion position is invalid.")}_execute(){const t=this.nodes;this.nodes=new Vs([...t].map(t=>t._clone(!0))),Ya(this.position,t);}toJSON(){const t=super.toJSON();return t.position=this.position.toJSON(),t.nodes=this.nodes.toJSON(),t}static get className(){return "InsertOperation"}static fromJSON(t,e){const n=[];for(const e of t.nodes)e.name?n.push(zs.fromJSON(e)):n.push(Ls.fromJSON(e));const i=new ic(Hs.fromJSON(t.position,e),n,t.baseVersion);return i.shouldReceiveAttributes=t.shouldReceiveAttributes,i}}class oc extends qa{constructor(t,e,n,i,o,r){super(r),this.name=t,this.oldRange=e?e.clone():null,this.newRange=n?n.clone():null,this.affectsData=o,this._markers=i;}get type(){return "marker"}clone(){return new oc(this.name,this.oldRange,this.newRange,this._markers,this.affectsData,this.baseVersion)}getReversed(){return new oc(this.name,this.newRange,this.oldRange,this._markers,this.affectsData,this.baseVersion+1)}_execute(){const t=this.newRange?"_set":"_remove";this._markers[t](this.name,this.newRange,!0,this.affectsData);}toJSON(){const t=super.toJSON();return this.oldRange&&(t.oldRange=this.oldRange.toJSON()),this.newRange&&(t.newRange=this.newRange.toJSON()),delete t._markers,t}static get className(){return "MarkerOperation"}static fromJSON(t,e){return new oc(t.name,t.oldRange?qs.fromJSON(t.oldRange,e):null,t.newRange?qs.fromJSON(t.newRange,e):null,e.model.markers,t.affectsData,t.baseVersion)}}class rc extends qa{constructor(t,e,n,i){super(i),this.position=t,this.position.stickiness="toNext",this.oldName=e,this.newName=n;}get type(){return "rename"}clone(){return new rc(this.position.clone(),this.oldName,this.newName,this.baseVersion)}getReversed(){return new rc(this.position.clone(),this.newName,this.oldName,this.baseVersion+1)}_validate(){const t=this.position.nodeAfter;if(!(t instanceof zs))throw new P.b("rename-operation-wrong-position: Given position is invalid or node after it is not an instance of Element.");if(t.name!==this.oldName)throw new P.b("rename-operation-wrong-name: Element to change has different name than operation's old name.")}_execute(){this.position.nodeAfter.name=this.newName;}toJSON(){const t=super.toJSON();return t.position=this.position.toJSON(),t}static get className(){return "RenameOperation"}static fromJSON(t,e){return new rc(Hs.fromJSON(t.position,e),t.oldName,t.newName,t.baseVersion)}}class sc extends qa{constructor(t,e,n,i,o){super(o),this.root=t,this.key=e,this.oldValue=n,this.newValue=i;}get type(){return null===this.oldValue?"addRootAttribute":null===this.newValue?"removeRootAttribute":"changeRootAttribute"}clone(){return new sc(this.root,this.key,this.oldValue,this.newValue,this.baseVersion)}getReversed(){return new sc(this.root,this.key,this.newValue,this.oldValue,this.baseVersion+1)}_validate(){if(this.root!=this.root.root||this.root.is("documentFragment"))throw new P.b("rootattribute-operation-not-a-root: The element to change is not a root element.",{root:this.root,key:this.key});if(null!==this.oldValue&&this.root.getAttribute(this.key)!==this.oldValue)throw new P.b("rootattribute-operation-wrong-old-value: Changed node has different attribute value than operation's old attribute value.",{root:this.root,key:this.key});if(null===this.oldValue&&null!==this.newValue&&this.root.hasAttribute(this.key))throw new P.b("rootattribute-operation-attribute-exists: The attribute with given key already exists.",{root:this.root,key:this.key})}_execute(){null!==this.newValue?this.root._setAttribute(this.key,this.newValue):this.root._removeAttribute(this.key);}toJSON(){const t=super.toJSON();return t.root=this.root.toJSON(),t}static get className(){return "RootAttributeOperation"}static fromJSON(t,e){if(!e.getRoot(t.root))throw new P.b("rootattribute-operation-fromjson-no-root: Cannot create RootAttributeOperation. Root with specified name does not exist.",{rootName:t.root});return new sc(e.getRoot(t.root),t.key,t.oldValue,t.newValue,t.baseVersion)}}class ac extends qa{constructor(t,e,n,i,o){super(o),this.sourcePosition=t.clone(),this.sourcePosition.stickiness="toPrevious",this.howMany=e,this.targetPosition=n.clone(),this.targetPosition.stickiness="toNext",this.graveyardPosition=i.clone();}get type(){return "merge"}get deletionPosition(){return new Hs(this.sourcePosition.root,this.sourcePosition.path.slice(0,-1))}get movedRange(){const t=this.sourcePosition.getShiftedBy(Number.POSITIVE_INFINITY);return new qs(this.sourcePosition,t)}clone(){return new this.constructor(this.sourcePosition,this.howMany,this.targetPosition,this.graveyardPosition,this.baseVersion)}getReversed(){const t=this.targetPosition._getTransformedByMergeOperation(this),e=this.sourcePosition.path.slice(0,-1),n=new Hs(this.sourcePosition.root,e)._getTransformedByMergeOperation(this),i=new cc(t,this.howMany,this.graveyardPosition,this.baseVersion+1);return i.insertionPosition=n,i}_validate(){const t=this.sourcePosition.parent,e=this.targetPosition.parent;if(!(t&&t.is("element")&&t.parent))throw new P.b("merge-operation-source-position-invalid: Merge source position is invalid.");if(!(e&&e.is("element")&&e.parent))throw new P.b("merge-operation-target-position-invalid: Merge target position is invalid.");if(this.howMany!=t.maxOffset)throw new P.b("merge-operation-how-many-invalid: Merge operation specifies wrong number of nodes to move.")}_execute(){const t=this.sourcePosition.parent;Ga(qs._createIn(t),this.targetPosition),Ga(qs._createOn(t),this.graveyardPosition);}toJSON(){const t=super.toJSON();return t.sourcePosition=t.sourcePosition.toJSON(),t.targetPosition=t.targetPosition.toJSON(),t.graveyardPosition=t.graveyardPosition.toJSON(),t}static get className(){return "MergeOperation"}static fromJSON(t,e){const n=Hs.fromJSON(t.sourcePosition,e),i=Hs.fromJSON(t.targetPosition,e),o=Hs.fromJSON(t.graveyardPosition,e);return new this(n,t.howMany,i,o,t.baseVersion)}}class cc extends qa{constructor(t,e,n,i){super(i),this.splitPosition=t.clone(),this.splitPosition.stickiness="toNext",this.howMany=e,this.insertionPosition=cc.getInsertionPosition(t),this.insertionPosition.stickiness="toNone",this.graveyardPosition=n?n.clone():null,this.graveyardPosition&&(this.graveyardPosition.stickiness="toNext");}get type(){return "split"}get moveTargetPosition(){const t=this.insertionPosition.path.slice();return t.push(0),new Hs(this.insertionPosition.root,t)}get movedRange(){const t=this.splitPosition.getShiftedBy(Number.POSITIVE_INFINITY);return new qs(this.splitPosition,t)}clone(){const t=new this.constructor(this.splitPosition,this.howMany,this.graveyardPosition,this.baseVersion);return t.insertionPosition=this.insertionPosition,t}getReversed(){const t=this.splitPosition.root.document.graveyard,e=new Hs(t,[0]);return new ac(this.moveTargetPosition,this.howMany,this.splitPosition,e,this.baseVersion+1)}_validate(){const t=this.splitPosition.parent,e=this.splitPosition.offset;if(!t||t.maxOffset<e)throw new P.b("split-operation-position-invalid: Split position is invalid.");if(!t.parent)throw new P.b("split-operation-split-in-root: Cannot split root element.");if(this.howMany!=t.maxOffset-this.splitPosition.offset)throw new P.b("split-operation-how-many-invalid: Split operation specifies wrong number of nodes to move.");if(this.graveyardPosition&&!this.graveyardPosition.nodeAfter)throw new P.b("split-operation-graveyard-position-invalid: Graveyard position invalid.")}_execute(){const t=this.splitPosition.parent;if(this.graveyardPosition)Ga(qs._createFromPositionAndShift(this.graveyardPosition,1),this.insertionPosition);else{const e=t._clone();Ya(this.insertionPosition,e);}Ga(new qs(Hs._createAt(t,this.splitPosition.offset),Hs._createAt(t,t.maxOffset)),this.moveTargetPosition);}toJSON(){const t=super.toJSON();return t.splitPosition=this.splitPosition.toJSON(),t.insertionPosition=this.insertionPosition.toJSON(),this.graveyardPosition&&(t.graveyardPosition=this.graveyardPosition.toJSON()),t}static get className(){return "SplitOperation"}static getInsertionPosition(t){const e=t.path.slice(0,-1);return e[e.length-1]++,new Hs(t.root,e)}static fromJSON(t,e){const n=Hs.fromJSON(t.splitPosition,e),i=Hs.fromJSON(t.insertionPosition,e),o=t.graveyardPosition?Hs.fromJSON(t.graveyardPosition,e):null,r=new this(n,t.howMany,o,t.baseVersion);return r.insertionPosition=i,r}}class lc extends zs{constructor(t,e,n="main"){super(e),this._doc=t,this.rootName=n;}get document(){return this._doc}is(t,e){return e?"rootElement"==t&&e==this.name||super.is(t,e):"rootElement"==t||super.is(t)}toJSON(){return this.rootName}}class dc{constructor(t,e){this.model=t,this.batch=e;}createText(t,e){return new Ls(t,e)}createElement(t,e){return new zs(t,e)}createDocumentFragment(){return new Wa}insert(t,e,n=0){this._assertWriterUsedCorrectly();const i=Hs._createAt(e,n);if(t.parent){if(gc(t.root,i.root))return void this.move(qs._createOn(t),i);if(t.root.document)throw new Error("model-writer-insert-forbidden-move: Cannot move a node from a document to a different tree.");this.remove(t);}const o=i.root.document?i.root.document.version:null,r=new ic(i,t,o);if(t instanceof Ls&&(r.shouldReceiveAttributes=!0),this.batch.addOperation(r),this.model.applyOperation(r),t instanceof Wa)for(const[e,n]of t.markers){const t=Hs._createAt(n.root,0),o=new qs(n.start._getCombined(t,i),n.end._getCombined(t,i));this.addMarker(e,{range:o,usingOperation:!0,affectsData:!0});}}insertText(t,e,n,i){e instanceof Wa||e instanceof zs||e instanceof Hs?this.insert(this.createText(t),e,n):this.insert(this.createText(t,e),n,i);}insertElement(t,e,n,i){e instanceof Wa||e instanceof zs||e instanceof Hs?this.insert(this.createElement(t),e,n):this.insert(this.createElement(t,e),n,i);}append(t,e){this.insert(t,e,"end");}appendText(t,e,n){e instanceof Wa||e instanceof zs?this.insert(this.createText(t),e,"end"):this.insert(this.createText(t,e),n,"end");}appendElement(t,e,n){e instanceof Wa||e instanceof zs?this.insert(this.createElement(t),e,"end"):this.insert(this.createElement(t,e),n,"end");}setAttribute(t,e,n){if(this._assertWriterUsedCorrectly(),n instanceof qs){const i=n.getMinimalFlatRanges();for(const n of i)uc(this,t,e,n);}else hc(this,t,e,n);}setAttributes(t,e){for(const[n,i]of Rs(t))this.setAttribute(n,i,e);}removeAttribute(t,e){if(this._assertWriterUsedCorrectly(),e instanceof qs){const n=e.getMinimalFlatRanges();for(const e of n)uc(this,t,null,e);}else hc(this,t,null,e);}clearAttributes(t){this._assertWriterUsedCorrectly();const e=t=>{for(const e of t.getAttributeKeys())this.removeAttribute(e,t);};if(t instanceof qs)for(const n of t.getItems())e(n);else e(t);}move(t,e,n){if(this._assertWriterUsedCorrectly(),!(t instanceof qs))throw new P.b("writer-move-invalid-range: Invalid range to move.");if(!t.isFlat)throw new P.b("writer-move-range-not-flat: Range to move is not flat.");const i=Hs._createAt(e,n);if(!gc(t.root,i.root))throw new P.b("writer-move-different-document: Range is going to be moved between different documents.");const o=t.root.document?t.root.document.version:null,r=new nc(t.start,t.end.offset-t.start.offset,i,o);this.batch.addOperation(r),this.model.applyOperation(r);}remove(t){if(this._assertWriterUsedCorrectly(),t instanceof qs){const e=t.getMinimalFlatRanges().reverse();for(const t of e)mc(t.start,t.end.offset-t.start.offset,this.batch,this.model);}else{const e=t.is("text")?t.offsetSize:1;mc(Hs._createBefore(t),e,this.batch,this.model);}}merge(t){this._assertWriterUsedCorrectly();const e=t.nodeBefore,n=t.nodeAfter;if(!(e instanceof zs))throw new P.b("writer-merge-no-element-before: Node before merge position must be an element.");if(!(n instanceof zs))throw new P.b("writer-merge-no-element-after: Node after merge position must be an element.");t.root.document?this._merge(t):this._mergeDetached(t);}createPositionFromPath(t,e,n){return this.model.createPositionFromPath(t,e,n)}createPositionAt(t,e){return this.model.createPositionAt(t,e)}createPositionAfter(t){return this.model.createPositionAfter(t)}createPositionBefore(t){return this.model.createPositionBefore(t)}createRange(t,e){return this.model.createRange(t,e)}createRangeIn(t){return this.model.createRangeIn(t)}createRangeOn(t){return this.model.createRangeOn(t)}createSelection(t,e,n){return this.model.createSelection(t,e,n)}_mergeDetached(t){const e=t.nodeBefore,n=t.nodeAfter;this.move(qs._createIn(n),Hs._createAt(e,"end")),this.remove(n);}_merge(t){const e=Hs._createAt(t.nodeBefore,"end"),n=Hs._createAt(t.nodeAfter,0),i=t.root.document.graveyard,o=new Hs(i,[0]),r=t.root.document.version,s=new ac(n,t.nodeAfter.maxOffset,e,o,r);this.batch.addOperation(s),this.model.applyOperation(s);}rename(t,e){if(this._assertWriterUsedCorrectly(),!(t instanceof zs))throw new P.b("writer-rename-not-element-instance: Trying to rename an object which is not an instance of Element.");const n=t.root.document?t.root.document.version:null,i=new rc(Hs._createBefore(t),t.name,e,n);this.batch.addOperation(i),this.model.applyOperation(i);}split(t,e){this._assertWriterUsedCorrectly();let n,i,o=t.parent;if(!o.parent)throw new P.b("writer-split-element-no-parent: Element with no parent can not be split.");if(e||(e=o.parent),!t.parent.getAncestors({includeSelf:!0}).includes(e))throw new P.b("writer-split-invalid-limit-element: Limit element is not a position ancestor.");do{const e=o.root.document?o.root.document.version:null,r=o.maxOffset-t.offset,s=new cc(t,r,null,e);this.batch.addOperation(s),this.model.applyOperation(s),n||i||(n=o,i=t.parent.nextSibling),o=(t=this.createPositionAfter(t.parent)).parent;}while(o!==e);return {position:t,range:new qs(Hs._createAt(n,"end"),Hs._createAt(i,0))}}wrap(t,e){if(this._assertWriterUsedCorrectly(),!t.isFlat)throw new P.b("writer-wrap-range-not-flat: Range to wrap is not flat.");const n=e instanceof zs?e:new zs(e);if(n.childCount>0)throw new P.b("writer-wrap-element-not-empty: Element to wrap with is not empty.");if(null!==n.parent)throw new P.b("writer-wrap-element-attached: Element to wrap with is already attached to tree model.");const i=t.root.document?t.root.document.version:null,o=new ic(t.start,n,i);this.batch.addOperation(o),this.model.applyOperation(o);const r=new nc(t.start.getShiftedBy(1),t.end.offset-t.start.offset,Hs._createAt(n,0),null===i?null:i+1);this.batch.addOperation(r),this.model.applyOperation(r);}unwrap(t){if(this._assertWriterUsedCorrectly(),null===t.parent)throw new P.b("writer-unwrap-element-no-parent: Trying to unwrap an element which has no parent.");this.move(qs._createIn(t),this.createPositionAfter(t)),this.remove(t);}addMarker(t,e){if(this._assertWriterUsedCorrectly(),!e||"boolean"!=typeof e.usingOperation)throw new P.b("writer-addMarker-no-usingOperations: The options.usingOperations parameter is required when adding a new marker.");const n=e.usingOperation,i=e.range,o=void 0!==e.affectsData&&e.affectsData;if(this.model.markers.has(t))throw new P.b("writer-addMarker-marker-exists: Marker with provided name already exists.");if(!i)throw new P.b("writer-addMarker-no-range: Range parameter is required when adding a new marker.");return n?(fc(this,t,null,i,o),this.model.markers.get(t)):this.model.markers._set(t,i,n,o)}updateMarker(t,e={}){this._assertWriterUsedCorrectly();const n="string"==typeof t?t:t.name,i=this.model.markers.get(n);if(!i)throw new P.b("writer-updateMarker-marker-not-exists: Marker with provided name does not exists.");const o="boolean"==typeof e.usingOperation,r="boolean"==typeof e.affectsData,s=r?e.affectsData:i.affectsData;if(!o&&!e.range&&!r)throw new P.b("writer-updateMarker-wrong-options: One of the options is required - provide range, usingOperations or affectsData.");const a=i.getRange(),c=e.range?e.range:a;o&&e.usingOperation!==i.managedUsingOperations?e.usingOperation?fc(this,n,null,c,s):(fc(this,n,a,null,s),this.model.markers._set(n,c,void 0,s)):i.managedUsingOperations?fc(this,n,a,c,s):this.model.markers._set(n,c,void 0,s);}removeMarker(t){this._assertWriterUsedCorrectly();const e="string"==typeof t?t:t.name;if(!this.model.markers.has(e))throw new P.b("writer-removeMarker-no-marker: Trying to remove marker which does not exist.");const n=this.model.markers.get(e);n.managedUsingOperations?fc(this,e,n.getRange(),null,n.affectsData):this.model.markers._remove(e);}setSelection(t,e,n){this._assertWriterUsedCorrectly(),this.model.document.selection._setTo(t,e,n);}setSelectionFocus(t,e){this._assertWriterUsedCorrectly(),this.model.document.selection._setFocus(t,e);}setSelectionAttribute(t,e){if(this._assertWriterUsedCorrectly(),"string"==typeof t)this._setSelectionAttribute(t,e);else for(const[e,n]of Rs(t))this._setSelectionAttribute(e,n);}removeSelectionAttribute(t){if(this._assertWriterUsedCorrectly(),"string"==typeof t)this._removeSelectionAttribute(t);else for(const e of t)this._removeSelectionAttribute(e);}overrideSelectionGravity(){return this.model.document.selection._overrideGravity()}restoreSelectionGravity(t){this.model.document.selection._restoreGravity(t);}_setSelectionAttribute(t,e){const n=this.model.document.selection;if(n.isCollapsed&&n.anchor.parent.isEmpty){const i=ea._getStoreAttributeKey(t);this.setAttribute(i,e,n.anchor.parent);}n._setAttribute(t,e);}_removeSelectionAttribute(t){const e=this.model.document.selection;if(e.isCollapsed&&e.anchor.parent.isEmpty){const n=ea._getStoreAttributeKey(t);this.removeAttribute(n,e.anchor.parent);}e._removeAttribute(t);}_assertWriterUsedCorrectly(){if(this.model._currentWriter!==this)throw new P.b("writer-incorrect-use: Trying to use a writer outside the change() block.")}}function uc(t,e,n,i){const o=t.model,r=o.document;let s,a,c,l=i.start;for(const t of i.getWalker({shallow:!0}))c=t.item.getAttribute(e),s&&a!=c&&(a!=n&&d(),l=s),s=t.nextPosition,a=c;function d(){const i=new qs(l,s),c=i.root.document?r.version:null,d=new tc(i,e,a,n,c);t.batch.addOperation(d),o.applyOperation(d);}s instanceof Hs&&s!=l&&a!=n&&d();}function hc(t,e,n,i){const o=t.model,r=o.document,s=i.getAttribute(e);let a,c;if(s!=n){if(i.root===i){const t=i.document?r.version:null;c=new sc(i,e,s,n,t);}else{const o=(a=new qs(Hs._createBefore(i),t.createPositionAfter(i))).root.document?r.version:null;c=new tc(a,e,s,n,o);}t.batch.addOperation(c),o.applyOperation(c);}}function fc(t,e,n,i,o){const r=t.model,s=r.document,a=new oc(e,n,i,r.markers,o,s.version);t.batch.addOperation(a),r.applyOperation(a);}function mc(t,e,n,i){let o;if(t.root.document){const n=i.document,r=new Hs(n.graveyard,[0]);o=new nc(t,e,r,n.version);}else o=new ec(t,e);n.addOperation(o),i.applyOperation(o);}function gc(t,e){return t===e||t instanceof lc&&e instanceof lc}class pc{constructor(t){this._markerCollection=t,this._changesInElement=new Map,this._elementSnapshots=new Map,this._changedMarkers=new Map,this._changeCount=0,this._cachedChanges=null,this._cachedChangesWithGraveyard=null;}get isEmpty(){return 0==this._changesInElement.size&&0==this._changedMarkers.size}bufferOperation(t){switch(t.type){case"insert":if(this._isInInsertedElement(t.position.parent))return;this._markInsert(t.position.parent,t.position.offset,t.nodes.maxOffset);break;case"addAttribute":case"removeAttribute":case"changeAttribute":for(const e of t.range.getItems())this._isInInsertedElement(e.parent)||this._markAttribute(e);break;case"remove":case"move":case"reinsert":{const e=this._isInInsertedElement(t.sourcePosition.parent),n=this._isInInsertedElement(t.targetPosition.parent);e||this._markRemove(t.sourcePosition.parent,t.sourcePosition.offset,t.howMany),n||this._markInsert(t.targetPosition.parent,t.getMovedRangeStart().offset,t.howMany);break}case"rename":{if(this._isInInsertedElement(t.position.parent))return;this._markRemove(t.position.parent,t.position.offset,1),this._markInsert(t.position.parent,t.position.offset,1);const e=qs._createFromPositionAndShift(t.position,1);for(const t of this._markerCollection.getMarkersIntersectingRange(e)){const e=t.getRange();this.bufferMarkerChange(t.name,e,e,t.affectsData);}break}case"split":{const e=t.splitPosition.parent;this._isInInsertedElement(e)||this._markRemove(e,t.splitPosition.offset,t.howMany),this._isInInsertedElement(t.insertionPosition.parent)||this._markInsert(t.insertionPosition.parent,t.insertionPosition.offset,1),t.graveyardPosition&&this._markRemove(t.graveyardPosition.parent,t.graveyardPosition.offset,1);break}case"merge":{const e=t.sourcePosition.parent;this._isInInsertedElement(e.parent)||this._markRemove(e.parent,e.startOffset,1);const n=t.graveyardPosition.parent;this._markInsert(n,t.graveyardPosition.offset,1);const i=t.targetPosition.parent;this._isInInsertedElement(i)||this._markInsert(i,t.targetPosition.offset,e.maxOffset);break}}this._cachedChanges=null;}bufferMarkerChange(t,e,n,i){const o=this._changedMarkers.get(t);o?(o.newRange=n,o.affectsData=i,null==o.oldRange&&null==o.newRange&&this._changedMarkers.delete(t)):this._changedMarkers.set(t,{oldRange:e,newRange:n,affectsData:i});}getMarkersToRemove(){const t=[];for(const[e,n]of this._changedMarkers)null!=n.oldRange&&t.push({name:e,range:n.oldRange});return t}getMarkersToAdd(){const t=[];for(const[e,n]of this._changedMarkers)null!=n.newRange&&t.push({name:e,range:n.newRange});return t}hasDataChanges(){for(const[,t]of this._changedMarkers)if(t.affectsData)return !0;return this._changesInElement.size>0}getChanges(t={includeChangesInGraveyard:!1}){if(this._cachedChanges)return t.includeChangesInGraveyard?this._cachedChangesWithGraveyard.slice():this._cachedChanges.slice();const e=[];for(const t of this._changesInElement.keys()){const n=this._changesInElement.get(t).sort((t,e)=>t.offset===e.offset?t.type!=e.type?"remove"==t.type?-1:1:0:t.offset<e.offset?-1:1),i=this._elementSnapshots.get(t),o=bc(t.getChildren()),r=wc(i.length,n);let s=0,a=0;for(const n of r)if("i"===n)e.push(this._getInsertDiff(t,s,o[s].name)),s++;else if("r"===n)e.push(this._getRemoveDiff(t,s,i[a].name)),a++;else if("a"===n){const n=o[s].attributes,r=i[a].attributes;let c;if("$text"==o[s].name)c=new qs(Hs._createAt(t,s),Hs._createAt(t,s+1));else{const e=t.offsetToIndex(s);c=new qs(Hs._createAt(t,s),Hs._createAt(t.getChild(e),0));}e.push(...this._getAttributesDiff(c,r,n)),s++,a++;}else s++,a++;}e.sort((t,e)=>t.position.root!=e.position.root?t.position.root.rootName<e.position.root.rootName?-1:1:t.position.isEqual(e.position)?t.changeCount-e.changeCount:t.position.isBefore(e.position)?-1:1);for(let t=1;t<e.length;t++){const n=e[t-1],i=e[t],o="remove"==n.type&&"remove"==i.type&&"$text"==n.name&&"$text"==i.name&&n.position.isEqual(i.position),r="insert"==n.type&&"insert"==i.type&&"$text"==n.name&&"$text"==i.name&&n.position.parent==i.position.parent&&n.position.offset+n.length==i.position.offset,s="attribute"==n.type&&"attribute"==i.type&&n.position.parent==i.position.parent&&n.range.isFlat&&i.range.isFlat&&n.position.offset+n.length==i.position.offset&&n.attributeKey==i.attributeKey&&n.attributeOldValue==i.attributeOldValue&&n.attributeNewValue==i.attributeNewValue;(o||r||s)&&(e[t-1].length++,s&&(e[t-1].range.end=e[t-1].range.end.getShiftedBy(1)),e.splice(t,1),t--);}for(const t of e)delete t.changeCount,"attribute"==t.type&&(delete t.position,delete t.length);return this._changeCount=0,this._cachedChangesWithGraveyard=e.slice(),this._cachedChanges=e.slice().filter(_c),t.includeChangesInGraveyard?this._cachedChangesWithGraveyard:this._cachedChanges}reset(){this._changesInElement.clear(),this._elementSnapshots.clear(),this._changedMarkers.clear(),this._cachedChanges=null;}_markInsert(t,e,n){const i={type:"insert",offset:e,howMany:n,count:this._changeCount++};this._markChange(t,i);}_markRemove(t,e,n){const i={type:"remove",offset:e,howMany:n,count:this._changeCount++};this._markChange(t,i),this._removeAllNestedChanges(t,e,n);}_markAttribute(t){const e={type:"attribute",offset:t.startOffset,howMany:t.offsetSize,count:this._changeCount++};this._markChange(t.parent,e);}_markChange(t,e){this._makeSnapshot(t);const n=this._getChangesForElement(t);this._handleChange(e,n),n.push(e);for(let t=0;t<n.length;t++)n[t].howMany<1&&(n.splice(t,1),t--);}_getChangesForElement(t){let e;return this._changesInElement.has(t)?e=this._changesInElement.get(t):(e=[],this._changesInElement.set(t,e)),e}_makeSnapshot(t){this._elementSnapshots.has(t)||this._elementSnapshots.set(t,bc(t.getChildren()));}_handleChange(t,e){t.nodesToHandle=t.howMany;for(const n of e){const i=t.offset+t.howMany,o=n.offset+n.howMany;if("insert"==t.type&&("insert"==n.type&&(t.offset<=n.offset?n.offset+=t.howMany:t.offset<o&&(n.howMany+=t.nodesToHandle,t.nodesToHandle=0)),"remove"==n.type&&t.offset<n.offset&&(n.offset+=t.howMany),"attribute"==n.type))if(t.offset<=n.offset)n.offset+=t.howMany;else if(t.offset<o){const o=n.howMany;n.howMany=t.offset-n.offset,e.unshift({type:"attribute",offset:i,howMany:o-n.howMany,count:this._changeCount++});}if("remove"==t.type){if("insert"==n.type)if(i<=n.offset)n.offset-=t.howMany;else if(i<=o)if(t.offset<n.offset){const e=i-n.offset;n.offset=t.offset,n.howMany-=e,t.nodesToHandle-=e;}else n.howMany-=t.nodesToHandle,t.nodesToHandle=0;else if(t.offset<=n.offset)t.nodesToHandle-=n.howMany,n.howMany=0;else if(t.offset<o){const e=o-t.offset;n.howMany-=e,t.nodesToHandle-=e;}if("remove"==n.type&&(i<=n.offset?n.offset-=t.howMany:t.offset<n.offset&&(t.nodesToHandle+=n.howMany,n.howMany=0)),"attribute"==n.type)if(i<=n.offset)n.offset-=t.howMany;else if(t.offset<n.offset){const e=i-n.offset;n.offset=t.offset,n.howMany-=e;}else if(t.offset<o)if(i<=o){const i=n.howMany;n.howMany=t.offset-n.offset;const o=i-n.howMany-t.nodesToHandle;e.unshift({type:"attribute",offset:t.offset,howMany:o,count:this._changeCount++});}else n.howMany-=o-t.offset;}if("attribute"==t.type){if("insert"==n.type)if(t.offset<n.offset&&i>n.offset){if(i>o){const t={type:"attribute",offset:o,howMany:i-o,count:this._changeCount++};this._handleChange(t,e),e.push(t);}t.nodesToHandle=n.offset-t.offset,t.howMany=t.nodesToHandle;}else t.offset>=n.offset&&t.offset<o&&(i>o?(t.nodesToHandle=i-o,t.offset=o):t.nodesToHandle=0);"attribute"==n.type&&(t.offset>=n.offset&&i<=o?(t.nodesToHandle=0,t.howMany=0,t.offset=0):t.offset<=n.offset&&i>=o&&(n.howMany=0));}}t.howMany=t.nodesToHandle,delete t.nodesToHandle;}_getInsertDiff(t,e,n){return {type:"insert",position:Hs._createAt(t,e),name:n,length:1,changeCount:this._changeCount++}}_getRemoveDiff(t,e,n){return {type:"remove",position:Hs._createAt(t,e),name:n,length:1,changeCount:this._changeCount++}}_getAttributesDiff(t,e,n){const i=[];n=new Map(n);for(const[o,r]of e){const e=n.has(o)?n.get(o):null;e!==r&&i.push({type:"attribute",position:t.start,range:t.clone(),length:1,attributeKey:o,attributeOldValue:r,attributeNewValue:e,changeCount:this._changeCount++}),n.delete(o);}for(const[e,o]of n)i.push({type:"attribute",position:t.start,range:t.clone(),length:1,attributeKey:e,attributeOldValue:null,attributeNewValue:o,changeCount:this._changeCount++});return i}_isInInsertedElement(t){const e=t.parent;if(!e)return !1;const n=this._changesInElement.get(e),i=t.startOffset;if(n)for(const t of n)if("insert"==t.type&&i>=t.offset&&i<t.offset+t.howMany)return !0;return this._isInInsertedElement(e)}_removeAllNestedChanges(t,e,n){const i=new qs(Hs._createAt(t,e),Hs._createAt(t,e+n));for(const t of i.getItems({shallow:!0}))t.is("element")&&(this._elementSnapshots.delete(t),this._changesInElement.delete(t),this._removeAllNestedChanges(t,0,t.maxOffset));}}function bc(t){const e=[];for(const n of t)if(n.is("text"))for(let t=0;t<n.data.length;t++)e.push({name:"$text",attributes:new Map(n.getAttributes())});else e.push({name:n.name,attributes:new Map(n.getAttributes())});return e}function wc(t,e){const n=[];let i=0,o=0;for(const t of e)t.offset>i&&(n.push(..."e".repeat(t.offset-i).split("")),o+=t.offset-i),"insert"==t.type?(n.push(..."i".repeat(t.howMany).split("")),i=t.offset+t.howMany):"remove"==t.type?(n.push(..."r".repeat(t.howMany).split("")),i=t.offset,o+=t.howMany):(n.push(..."a".repeat(t.howMany).split("")),i=t.offset+t.howMany,o+=t.howMany);return o<t&&n.push(..."e".repeat(t-o).split("")),n}function _c(t){const e=t.position&&"$graveyard"==t.position.root.rootName,n=t.range&&"$graveyard"==t.range.root.rootName;return !e&&!n}class kc{constructor(){this._operations=[],this._undoPairs=new Map,this._undoneOperations=new Set;}addOperation(t){this._operations.includes(t)||this._operations.push(t);}getOperations(t=0,e=Number.POSITIVE_INFINITY){return t<0?[]:this._operations.slice(t,e)}getOperation(t){return this._operations[t]}setOperationAsUndone(t,e){this._undoPairs.set(e,t),this._undoneOperations.add(t);}isUndoingOperation(t){return this._undoPairs.has(t)}isUndoneOperation(t){return this._undoneOperations.has(t)}getUndoneOperation(t){return this._undoPairs.get(t)}}function vc(t,e){return function(t){return !!t&&1==t.length&&/[\ud800-\udbff]/.test(t)}(t.charAt(e-1))&&function(t){return !!t&&1==t.length&&/[\udc00-\udfff]/.test(t)}(t.charAt(e))}function yc(t,e){return function(t){return !!t&&1==t.length&&/[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/.test(t)}(t.charAt(e))}const xc="$graveyard";class Ac{constructor(t){this.model=t,this.version=0,this.history=new kc(this),this.selection=new ea(this),this.roots=new Xi({idProperty:"rootName"}),this.differ=new pc(t.markers),this._postFixers=new Set,this.createRoot("$root",xc),this.listenTo(t,"applyOperation",(t,e)=>{const n=e[0];if(n.isDocumentOperation&&n.baseVersion!==this.version)throw new P.b("model-document-applyOperation-wrong-version: Only operations with matching versions can be applied.",{operation:n})},{priority:"highest"}),this.listenTo(t,"applyOperation",(t,e)=>{const n=e[0];n.isDocumentOperation&&this.differ.bufferOperation(n);},{priority:"high"}),this.listenTo(t,"applyOperation",(t,e)=>{const n=e[0];n.isDocumentOperation&&(this.version++,this.history.addOperation(n));},{priority:"low"});let e=!1;this.listenTo(this.selection,"change",()=>{e=!0;}),this.listenTo(t,"_change",(t,n)=>{this.differ.isEmpty&&!e||(this._callPostFixers(n),this.differ.hasDataChanges()?this.fire("change:data",n.batch):this.fire("change",n.batch),this.differ.reset(),e=!1);}),this.listenTo(t.markers,"update",(t,e,n,i)=>{this.differ.bufferMarkerChange(e.name,n,i,e.affectsData),null===n&&e.on("change",(t,n)=>{this.differ.bufferMarkerChange(e.name,n,e.getRange(),e.affectsData);});});}get graveyard(){return this.getRoot(xc)}createRoot(t="$root",e="main"){if(this.roots.get(e))throw new P.b("model-document-createRoot-name-exists: Root with specified name already exists.",{name:e});const n=new lc(this,t,e);return this.roots.add(n),n}destroy(){this.selection.destroy(),this.stopListening();}getRoot(t="main"){return this.roots.get(t)}getRootNames(){return Array.from(this.roots,t=>t.rootName).filter(t=>t!=xc)}registerPostFixer(t){this._postFixers.add(t);}toJSON(){const t=si(this);return t.selection="[engine.model.DocumentSelection]",t.model="[engine.model.Model]",t}_getDefaultRoot(){for(const t of this.roots)if(t!==this.graveyard)return t;return this.graveyard}_getDefaultRange(){const t=this._getDefaultRoot(),e=this.model,n=e.schema,i=e.createPositionFromPath(t,[0]);return n.getNearestSelectionRange(i)||e.createRange(i)}_validateSelectionRange(t){return Cc(t.start)&&Cc(t.end)}_callPostFixers(t){let e=!1;do{for(const n of this._postFixers)if(e=n(t))break}while(e)}}function Cc(t){const e=t.textNode;if(e){const n=e.data,i=t.offset-e.startOffset;return !vc(n,i)&&!yc(n,i)}return !0}F(Ac,R);class Tc{constructor(){this._markers=new Map;}[Symbol.iterator](){return this._markers.values()}has(t){return this._markers.has(t)}get(t){return this._markers.get(t)||null}_set(t,e,n=!1,i=!1){const o=t instanceof Pc?t.name:t,r=this._markers.get(o);if(r){const t=r.getRange();let s=!1;return t.isEqual(e)||(r._attachLiveRange(Xs.fromRange(e)),s=!0),n!=r.managedUsingOperations&&(r._managedUsingOperations=n,s=!0),"boolean"==typeof i&&i!=r.affectsData&&(r._affectsData=i,s=!0),s&&this.fire("update:"+o,r,t,e),r}const s=Xs.fromRange(e),a=new Pc(o,s,n,i);return this._markers.set(o,a),this.fire("update:"+o,a,null,e),a}_remove(t){const e=t instanceof Pc?t.name:t,n=this._markers.get(e);return !!n&&(this._markers.delete(e),this.fire("update:"+e,n,n.getRange(),null),this._destroyMarker(n),!0)}*getMarkersAtPosition(t){for(const e of this)e.getRange().containsPosition(t)&&(yield e);}*getMarkersIntersectingRange(t){for(const e of this)null!==e.getRange().getIntersection(t)&&(yield e);}destroy(){for(const t of this._markers.values())this._destroyMarker(t);this._markers=null,this.stopListening();}*getMarkersGroup(t){for(const e of this._markers.values())e.name.startsWith(t+":")&&(yield e);}_destroyMarker(t){t.stopListening(),t._detachLiveRange();}}F(Tc,R);class Pc{constructor(t,e,n,i){this.name=t,this._liveRange=this._attachLiveRange(e),this._managedUsingOperations=n,this._affectsData=i;}get managedUsingOperations(){if(!this._liveRange)throw new P.b("marker-destroyed: Cannot use a destroyed marker instance.");return this._managedUsingOperations}get affectsData(){if(!this._liveRange)throw new P.b("marker-destroyed: Cannot use a destroyed marker instance.");return this._affectsData}getStart(){if(!this._liveRange)throw new P.b("marker-destroyed: Cannot use a destroyed marker instance.");return this._liveRange.start.clone()}getEnd(){if(!this._liveRange)throw new P.b("marker-destroyed: Cannot use a destroyed marker instance.");return this._liveRange.end.clone()}getRange(){if(!this._liveRange)throw new P.b("marker-destroyed: Cannot use a destroyed marker instance.");return this._liveRange.toRange()}_attachLiveRange(t){return this._liveRange&&this._detachLiveRange(),t.delegate("change:range").to(this),t.delegate("change:content").to(this),this._liveRange=t,t}_detachLiveRange(){this._liveRange.stopDelegating("change:range",this),this._liveRange.stopDelegating("change:content",this),this._liveRange.detach(),this._liveRange=null;}}F(Pc,R);class Mc extends Hs{constructor(t,e,n="toNone"){if(super(t,e,n),!this.root.is("rootElement"))throw new P.b("model-liveposition-root-not-rootelement: LivePosition's root has to be an instance of RootElement.");(function(){this.listenTo(this.root.document.model,"applyOperation",(t,e)=>{const n=e[0];n.isDocumentOperation&&function(t){const e=this.getTransformedByOperation(t);if(!this.isEqual(e)){const t=this.toPosition();this.path=e.path,this.root=e.root,this.fire("change",t);}}.call(this,n);},{priority:"low"});}).call(this);}detach(){this.stopListening();}toPosition(){return new Hs(this.root,this.path.slice(),this.stickiness)}static fromPosition(t,e){return new this(t.root,t.path.slice(),e||t.stickiness)}}F(Mc,R);class Sc{constructor(t,e,n){this.model=t,this.writer=e,this.position=n,this.canMergeWith=new Set([this.position.parent]),this.schema=t.schema,this._filterAttributesOf=[];}handleNodes(t,e){t=Array.from(t);for(let n=0;n<t.length;n++){const i=t[n];this._handleNode(i,{isFirst:0===n&&e.isFirst,isLast:n===t.length-1&&e.isLast});}this.schema.removeDisallowedAttributes(this._filterAttributesOf,this.writer),this._filterAttributesOf=[];}getSelectionRange(){return this.nodeToSelect?qs._createOn(this.nodeToSelect):this.model.schema.getNearestSelectionRange(this.position)}_handleNode(t,e){if(this.schema.isObject(t))return void this._handleObject(t,e);this._checkAndSplitToAllowedPosition(t,e)?(this._insert(t),this._mergeSiblingsOf(t,e)):this._handleDisallowedNode(t,e);}_handleObject(t,e){this._checkAndSplitToAllowedPosition(t)?this._insert(t):this._tryAutoparagraphing(t,e);}_handleDisallowedNode(t,e){t.is("element")?this.handleNodes(t.getChildren(),e):this._tryAutoparagraphing(t,e);}_insert(t){if(!this.schema.checkChild(this.position,t))return void fs.a.error("insertcontent-wrong-position: The node cannot be inserted on the given position.",{node:t,position:this.position});const e=Mc.fromPosition(this.position,"toNext");this.writer.insert(t,this.position),this.position=e.toPosition(),e.detach(),this.schema.isObject(t)&&!this.schema.checkChild(this.position,"$text")?this.nodeToSelect=t:this.nodeToSelect=null,this._filterAttributesOf.push(t);}_mergeSiblingsOf(t,e){if(!(t instanceof zs))return;const n=this._canMergeLeft(t,e),i=this._canMergeRight(t,e),o=Mc._createBefore(t);o.stickiness="toNext";const r=Mc._createAfter(t);if(r.stickiness="toNext",n){const t=Mc.fromPosition(this.position);t.stickiness="toNext",this.writer.merge(o),this.position=t.toPosition(),t.detach();}if(i){this.position.isEqual(r)||fs.a.error("insertcontent-wrong-position-on-merge: The insertion position should equal the merge position"),this.position=Hs._createAt(r.nodeBefore,"end");const t=new Mc(this.position.root,this.position.path,"toPrevious");this.writer.merge(r),this.position=t.toPosition(),t.detach();}(n||i)&&this._filterAttributesOf.push(this.position.parent),o.detach(),r.detach();}_canMergeLeft(t,e){const n=t.previousSibling;return e.isFirst&&n instanceof zs&&this.canMergeWith.has(n)&&this.model.schema.checkMerge(n,t)}_canMergeRight(t,e){const n=t.nextSibling;return e.isLast&&n instanceof zs&&this.canMergeWith.has(n)&&this.model.schema.checkMerge(t,n)}_tryAutoparagraphing(t,e){const n=this.writer.createElement("paragraph");this._getAllowedIn(n,this.position.parent)&&this.schema.checkChild(n,t)&&(n._appendChild(t),this._handleNode(n,e));}_checkAndSplitToAllowedPosition(t){const e=this._getAllowedIn(t,this.position.parent);if(!e)return !1;for(;e!=this.position.parent;){if(this.schema.isLimit(this.position.parent))return !1;if(this.position.isAtStart){const t=this.position.parent;this.position=this.writer.createPositionBefore(t),t.isEmpty&&this.writer.remove(t);}else if(this.position.isAtEnd)this.position=this.writer.createPositionAfter(this.position.parent);else{const t=this.writer.createPositionAfter(this.position.parent);this.writer.split(this.position),this.position=t,this.canMergeWith.add(this.position.nodeAfter);}}return !0}_getAllowedIn(t,e){return this.schema.checkChild(e,t)?e:e.parent?this._getAllowedIn(t,e.parent):null}}function Ic(t,e,n={}){if(e.isCollapsed)return;const i=t.schema;t.change(t=>{if(!n.doNotResetEntireContent&&function(t,e){const n=t.getLimitElement(e);if(!e.containsEntireContent(n))return !1;const i=e.getFirstRange();if(i.start.parent==i.end.parent)return !1;return t.checkChild(n,"paragraph")}(i,e))return void function(t,e){const n=t.model.schema.getLimitElement(e);t.remove(t.createRangeIn(n)),Ec(t,t.createPositionAt(n,0),e);}(t,e);const o=e.getFirstRange(),r=o.start,s=Mc.fromPosition(o.end,"toNext");o.start.isTouching(o.end)||t.remove(o),n.leaveUnmerged||(!function t(e,n,i){const o=n.parent;const r=i.parent;if(o==r)return;if(e.model.schema.isLimit(o)||e.model.schema.isLimit(r))return;if(!function(t,e,n){const i=new qs(t,e);for(const t of i.getWalker())if(n.isLimit(t.item))return !1;return !0}(n,i,e.model.schema))return;n=e.createPositionAfter(o);i=e.createPositionBefore(r);i.isEqual(n)||e.insert(r,n);e.merge(n);for(;i.parent.isEmpty;){const t=i.parent;i=e.createPositionBefore(t),e.remove(t);}t(e,n,i);}(t,r,s),i.removeDisallowedAttributes(r.parent.getChildren(),t)),e instanceof ea?t.setSelection(r):e.setTo(r),function(t,e){const n=t.checkChild(e,"$text"),i=t.checkChild(e,"paragraph");return !n&&i}(i,r)&&Ec(t,r,e),s.detach();});}function Ec(t,e,n){const i=t.createElement("paragraph");t.insert(i,e),n instanceof ea?t.setSelection(i,0):n.setTo(i,0);}const Nc=' ,.?!:;"-()';function Oc(t,e,n={}){const i=t.schema,o="backward"!=n.direction,r=n.unit?n.unit:"character",s=e.focus,a=new Bs({boundaries:function(t,e){const n=t.root,i=Hs._createAt(n,e?"end":0);return e?new qs(t,i):new qs(i,t)}(s,o),singleCharacters:!0,direction:o?"forward":"backward"}),c={walker:a,schema:i,isForward:o,unit:r};let l;for(;l=a.next();){if(l.done)return;const n=Rc(c,l.value);if(n)return void(e instanceof ea?t.change(t=>{t.setSelectionFocus(n);}):e.setFocus(n))}}function Rc(t,e){if("text"==e.type)return "word"===t.unit?function(t,e){let n=t.position.textNode;if(n){let i=t.position.offset-n.startOffset;for(;!Dc(n.data,i,e)&&!Lc(n,i,e);){t.next();const o=e?t.position.nodeAfter:t.position.nodeBefore;if(o&&o.is("text")){const i=o.data.charAt(e?0:o.data.length-1);Nc.includes(i)||(t.next(),n=t.position.textNode);}i=t.position.offset-n.startOffset;}}return t.position}(t.walker,t.isForward):function(t,e){const n=t.position.textNode;if(n){const i=n.data;let o=t.position.offset-n.startOffset;for(;vc(i,o)||"character"==e&&yc(i,o);)t.next(),o=t.position.offset-n.startOffset;}return t.position}(t.walker,t.unit,t.isForward);if(e.type==(t.isForward?"elementStart":"elementEnd")){if(t.schema.isObject(e.item))return Hs._createAt(e.item,t.isForward?"after":"before");if(t.schema.checkChild(e.nextPosition,"$text"))return e.nextPosition}else{if(t.schema.isLimit(e.item))return void t.walker.skip(()=>!0);if(t.schema.checkChild(e.nextPosition,"$text"))return e.nextPosition}}function Dc(t,e,n){const i=e+(n?0:-1);return Nc.includes(t.charAt(i))}function Lc(t,e,n){return e===(n?t.endOffset:0)}function jc(t,e){const n=[];Array.from(t.getItems({direction:"backward"})).map(t=>e.createRangeOn(t)).filter(e=>{return (e.start.isAfter(t.start)||e.start.isEqual(t.start))&&(e.end.isBefore(t.end)||e.end.isEqual(t.end))}).forEach(t=>{n.push(t.start.parent),e.remove(t);}),n.forEach(t=>{let n=t;for(;n.parent&&n.isEmpty;){const t=e.createRangeOn(n);n=n.parent,e.remove(t);}});}function Vc(t){t.document.registerPostFixer(e=>(function(t,e){const n=e.document.selection,i=e.schema,o=[];let r=!1;for(const t of n.getRanges()){const e=zc(t,i);e?(o.push(e),r=!0):o.push(t);}if(r){let e=o;if(o.length>1){const t=o[0].start,n=o[o.length-1].end;e=[new qs(t,n)];}t.setSelection(e,{backward:n.isBackward});}})(e,t));}function zc(t,e){return t.isCollapsed?function(t,e){const n=t.start,i=e.getNearestSelectionRange(n);if(!i)return null;const o=i.start;if(n.isEqual(o))return null;if(o.nodeAfter&&e.isLimit(o.nodeAfter))return new qs(o,Hs._createAfter(o.nodeAfter));return new qs(o)}(t,e):function(t,e){const n=t.start,i=t.end,o=e.checkChild(n,"$text"),r=e.checkChild(i,"$text"),s=e.getLimitElement(n),a=e.getLimitElement(i);if(s===a){if(o&&r)return null;if(function(t,e,n){const i=t.nodeAfter&&!n.isLimit(t.nodeAfter)||n.checkChild(t,"$text"),o=e.nodeBefore&&!n.isLimit(e.nodeBefore)||n.checkChild(e,"$text");return i&&o}(n,i,e)){const t=e.getNearestSelectionRange(n,"forward"),o=e.getNearestSelectionRange(i,"backward");return new qs(t?t.start:n,o?o.start:i)}}const c=s&&!s.is("rootElement"),l=a&&!a.is("rootElement");if(c||l){const t=Hs._createAt(s,0),o=Hs._createAt(a,0),r=c?Bc(t,e,"start"):n,d=l?Bc(o,e,"end"):i;return new qs(r,d)}return null}(t,e)}function Bc(t,e,n){let i=t.parent,o=i;for(;e.isLimit(o)&&o.parent;)i=o,o=o.parent;return "start"===n?Hs._createBefore(i):Hs._createAfter(i)}class Fc{constructor(){this.markers=new Tc,this.document=new Ac(this),this.schema=new ka,this._pendingChanges=[],this._currentWriter=null,["insertContent","deleteContent","modifySelection","getSelectedContent","applyOperation"].forEach(t=>this.decorate(t)),this.on("applyOperation",(t,e)=>{e[0]._validate();},{priority:"highest"}),this.schema.register("$root",{isLimit:!0}),this.schema.register("$block",{allowIn:"$root",isBlock:!0}),this.schema.register("$text",{allowIn:"$block"}),this.schema.register("$clipboardHolder",{allowContentOf:"$root",isLimit:!0}),this.schema.extend("$text",{allowIn:"$clipboardHolder"}),this.schema.register("$marker",{allowIn:["$root","$block"]}),Vc(this);}change(t){return 0===this._pendingChanges.length?(this._pendingChanges.push({batch:new Ha,callback:t}),this._runPendingChanges()[0]):t(this._currentWriter)}enqueueChange(t,e){"string"==typeof t?t=new Ha(t):"function"==typeof t&&(e=t,t=new Ha),this._pendingChanges.push({batch:t,callback:e}),1==this._pendingChanges.length&&this._runPendingChanges();}applyOperation(t){t._execute();}insertContent(t,e,n){!function(t,e,n,i){t.change(o=>{let r;(r=n?n instanceof Ks||n instanceof ea?n:o.createSelection(n,i):t.document.selection).isCollapsed||t.deleteContent(r);const s=new Sc(t,o,r.anchor);let a;a=e.is("documentFragment")?e.getChildren():[e],s.handleNodes(a,{isFirst:!0,isLast:!0});const c=s.getSelectionRange();c?r instanceof ea?o.setSelection(c):r.setTo(c):fs.a.warn("insertcontent-no-range: Cannot determine a proper selection range after insertion.");});}(this,t,e,n);}deleteContent(t,e){Ic(this,t,e);}modifySelection(t,e){Oc(this,t,e);}getSelectedContent(t){return function(t,e){return t.change(t=>{const n=t.createDocumentFragment(),i=e.getFirstRange();if(!i||i.isCollapsed)return n;const o=i.start.root,r=i.start.getCommonPath(i.end),s=o.getNodeByPath(r);let a;const c=(a=i.start.parent==i.end.parent?i:t.createRange(t.createPositionAt(s,i.start.path[r.length]),t.createPositionAt(s,i.end.path[r.length]+1))).end.offset-a.start.offset;for(const e of a.getItems({shallow:!0}))e.is("textProxy")?t.appendText(e.data,e.getAttributes(),n):t.append(e._clone(!0),n);if(a!=i){const e=i._getTransformedByMove(a.start,t.createPositionAt(n,0),c)[0],o=t.createRange(t.createPositionAt(n,0),e.start);jc(t.createRange(e.end,t.createPositionAt(n,"end")),t),jc(o,t);}return n})}(this,t)}hasContent(t){if(t instanceof zs&&(t=qs._createIn(t)),t.isCollapsed)return !1;for(const e of t.getItems())if(e.is("textProxy")||this.schema.isObject(e))return !0;return !1}createPositionFromPath(t,e,n){return new Hs(t,e,n)}createPositionAt(t,e){return Hs._createAt(t,e)}createPositionAfter(t){return Hs._createAfter(t)}createPositionBefore(t){return Hs._createBefore(t)}createRange(t,e){return new qs(t,e)}createRangeIn(t){return qs._createIn(t)}createRangeOn(t){return qs._createOn(t)}createSelection(t,e,n){return new Ks(t,e,n)}createBatch(){return new Ha}destroy(){this.document.destroy(),this.stopListening();}_runPendingChanges(){const t=[];for(this.fire("_beforeChanges");this._pendingChanges.length;){const e=this._pendingChanges[0].batch;this._currentWriter=new dc(this,e);const n=this._pendingChanges[0].callback(this._currentWriter);t.push(n),this.fire("_change",this._currentWriter),this._pendingChanges.shift(),this._currentWriter=null;}return this.fire("_afterChanges"),t}}F(Fc,Li);class Uc{constructor(){this._listener=Object.create(rr);}listenTo(t){this._listener.listenTo(t,"keydown",(t,e)=>{this._listener.fire("_keydown:"+fo(e),e);});}set(t,e,n={}){const i=mo(t),o=n.priority;this._listener.listenTo(this._listener,"_keydown:"+i,(t,n)=>{e(n,()=>{n.preventDefault(),n.stopPropagation(),t.stop();}),t.return=!0;},{priority:o});}press(t){return !!this._listener.fire("_keydown:"+fo(t),t)}destroy(){this._listener.stopListening();}}class Hc extends Uc{constructor(t){super(),this.editor=t;}set(t,e,n={}){if("string"==typeof e){const t=e;e=((e,n)=>{this.editor.execute(t),n();});}super.set(t,e,n);}}n(53);class qc{constructor(t){const e=this.constructor.builtinPlugins;this.config=new T(t,this.constructor.defaultConfig),this.config.define("plugins",e),this.plugins=new ma(this,e),this.commands=new ga,this.locale=new ba(this.config.get("language")),this.t=this.locale.t,this.set("state","initializing"),this.once("ready",()=>this.state="ready",{priority:"high"}),this.once("destroy",()=>this.state="destroyed",{priority:"high"}),this.set("isReadOnly",!1),this.model=new Fc,this.data=new za(this.model),this.editing=new fa(this.model),this.editing.view.document.bind("isReadOnly").to(this),this.conversion=new Ba,this.conversion.register("downcast",[this.editing.downcastDispatcher,this.data.downcastDispatcher]),this.conversion.register("editingDowncast",[this.editing.downcastDispatcher]),this.conversion.register("dataDowncast",[this.data.downcastDispatcher]),this.conversion.register("upcast",[this.data.upcastDispatcher]),this.keystrokes=new Hc(this),this.keystrokes.listenTo(this.editing.view.document);}initPlugins(){const t=this,e=this.config;return function(){const n=e.get("plugins")||[],i=e.get("removePlugins")||[],o=e.get("extraPlugins")||[];return t.plugins.load(n.concat(o),i)}().then(t=>n(t,"init").then(()=>n(t,"afterInit"))).then(()=>this.fire("pluginsReady"));function n(t,e){return t.reduce((t,n)=>n[e]?t.then(n[e].bind(n)):t,Promise.resolve())}}destroy(){let t=Promise.resolve();return "initializing"==this.state&&(t=new Promise(t=>this.once("ready",t))),t.then(()=>{this.fire("destroy"),this.stopListening(),this.commands.destroy();}).then(()=>this.plugins.destroy()).then(()=>{this.model.destroy(),this.data.destroy(),this.editing.destroy(),this.keystrokes.destroy();})}execute(...t){this.commands.execute(...t);}static create(t){return new Promise(e=>{const n=new this(t);e(n.initPlugins().then(()=>{n.fire("dataReady"),n.fire("ready");}).then(()=>n));})}}F(qc,Li);var Wc={setData(t){this.data.set(t);},getData(){return this.data.get()}};class Yc{getHtml(t){const e=document.implementation.createHTMLDocument("").createElement("div");return e.appendChild(t),e.innerHTML}}class $c{constructor(){this._domParser=new DOMParser,this._domConverter=new er({blockFiller:No}),this._htmlWriter=new Yc;}toData(t){const e=this._domConverter.viewToDom(t,document);return this._htmlWriter.getHtml(e)}toView(t){const e=this._toDom(t);return this._domConverter.domToView(e)}_toDom(t){const e=this._domParser.parseFromString(t,"text/html"),n=e.createDocumentFragment(),i=e.body.childNodes;for(;i.length>0;)n.appendChild(i[0]);return n}}class Gc{constructor(t){this.editor=t,this._components=new Map;}*names(){for(const t of this._components.values())yield t.originalName;}add(t,e){if(this.has(t))throw new P.b("componentfactory-item-exists: The item already exists in the component factory.",{name:t});this._components.set(Qc(t),{callback:e,originalName:t});}create(t){if(!this.has(t))throw new P.b("componentfactory-item-missing: The required component is not registered in the factory.",{name:t});return this._components.get(Qc(t)).callback(this.editor.locale)}has(t){return this._components.has(Qc(t))}}function Qc(t){return String(t).toLowerCase()}class Kc{constructor(){this.set("isFocused",!1),this.focusedElement=null,this._elements=new Set,this._nextEventLoopTimeout=null;}add(t){if(this._elements.has(t))throw new P.b("focusTracker-add-element-already-exist");this.listenTo(t,"focus",()=>this._focus(t),{useCapture:!0}),this.listenTo(t,"blur",()=>this._blur(),{useCapture:!0}),this._elements.add(t);}remove(t){t===this.focusedElement&&this._blur(t),this._elements.has(t)&&(this.stopListening(t),this._elements.delete(t));}_focus(t){clearTimeout(this._nextEventLoopTimeout),this.focusedElement=t,this.isFocused=!0;}_blur(){clearTimeout(this._nextEventLoopTimeout),this._nextEventLoopTimeout=setTimeout(()=>{this.focusedElement=null,this.isFocused=!1;},0);}}F(Kc,rr),F(Kc,Li);class Jc{constructor(t,e){this.editor=t,this.view=e,this.componentFactory=new Gc(t),this.focusTracker=new Kc,this.listenTo(t.editing.view.document,"layoutChanged",()=>this.update());}update(){this.fire("update");}destroy(){this.stopListening(),this.view.destroy();}}F(Jc,R);class Zc extends Jc{constructor(t,e){super(t,e),this._toolbarConfig=function(t){return Array.isArray(t)?{items:t}:t?Object.assign({items:[]},t):{items:[]}}(t.config.get("toolbar"));}init(){const t=this.editor,e=this.view;e.render();const n=t.editing.view.document.getRoot();e.editable.bind("isReadOnly").to(n),e.editable.bind("isFocused").to(t.editing.view.document),t.editing.view.attachDomRoot(e.editableElement),e.editable.name=n.rootName,this.focusTracker.add(this.view.editableElement),this.view.toolbar.fillFromConfig(this._toolbarConfig.items,this.componentFactory),function({origin:t,originKeystrokeHandler:e,originFocusTracker:n,toolbar:i,beforeFocus:o,afterBlur:r}){n.add(i.element),e.set("Alt+F10",(t,e)=>{n.isFocused&&!i.focusTracker.isFocused&&(o&&o(),i.focus(),e());}),i.keystrokes.set("Esc",(e,n)=>{i.focusTracker.isFocused&&(t.focus(),r&&r(),n());});}({origin:t.editing.view,originFocusTracker:this.focusTracker,originKeystrokeHandler:t.keystrokes,toolbar:this.view.toolbar});}}class Xc extends Xi{constructor(t){super({idProperty:"viewUid"}),this.on("add",(t,e,n)=>{e.isRendered||e.render(),e.element&&this._parentElement&&this._parentElement.insertBefore(e.element,this._parentElement.children[n]);}),this.on("remove",(t,e)=>{e.element&&this._parentElement&&e.element.remove();}),this.locale=t,this._parentElement=null;}destroy(){this.map(t=>t.destroy());}setParent(t){this._parentElement=t;}delegate(...t){if(!t.length||!function(t){return t.every(t=>"string"==typeof t)}(t))throw new P.b("ui-viewcollection-delegate-wrong-events: All event names must be strings.");return {to:e=>{for(const n of this)for(const i of t)n.delegate(i).to(e);this.on("add",(n,i)=>{for(const n of t)i.delegate(n).to(e);}),this.on("remove",(n,i)=>{for(const n of t)i.stopDelegating(n,e);});}}}}F(Xi,Li);var tl=1,el=4;var nl=function(t,e){return oi(t,tl|el,e="function"==typeof e?e:void 0)};const il="http://www.w3.org/1999/xhtml";class ol{constructor(t){Object.assign(this,fl(hl(t))),this._isRendered=!1,this._revertData=null;}render(){const t=this._renderNode({intoFragment:!0});return this._isRendered=!0,t}apply(t){return this._revertData={children:[],bindings:[],attributes:{}},this._renderNode({node:t,isApplying:!0,revertData:this._revertData}),t}revert(t){if(!this._revertData)throw new P.b("ui-template-revert-not-applied: Attempting to revert a template which has not been applied yet.");this._revertTemplateFromNode(t,this._revertData);}*getViews(){yield*function*t(e){if(e.children)for(const n of e.children)wl(n)?yield n:_l(n)&&(yield*t(n));}(this);}static bind(t,e){return {to:(n,i)=>new sl({eventNameOrFunction:n,attribute:n,observable:t,emitter:e,callback:i}),if:(n,i,o)=>new al({observable:t,emitter:e,attribute:n,valueIfTrue:i,callback:o})}}static extend(t,e){t._isRendered&&fs.a.warn("template-extend-render: Attempting to extend a template which has already been rendered."),function t(e,n){n.attributes&&(e.attributes||(e.attributes={}),pl(e.attributes,n.attributes));n.eventListeners&&(e.eventListeners||(e.eventListeners={}),pl(e.eventListeners,n.eventListeners));n.text&&e.text.push(...n.text);if(n.children&&n.children.length){if(e.children.length!=n.children.length)throw new P.b("ui-template-extend-children-mismatch: The number of children in extended definition does not match.");let i=0;for(const o of n.children)t(e.children[i++],o);}}(t,fl(hl(e)));}_renderNode(t){let e;if(e=t.node?this.tag&&this.text:this.tag?this.text:!this.text)throw new P.b('ui-template-wrong-syntax: Node definition must have either "tag" or "text" when rendering a new Node.');return this.text?this._renderText(t):this._renderElement(t)}_renderElement(t){let e=t.node;return e||(e=t.node=document.createElementNS(this.ns||il,this.tag)),this._renderAttributes(t),this._renderElementChildren(t),this._setUpListeners(t),e}_renderText(t){let e=t.node;return e?t.revertData.text=e.textContent:e=t.node=document.createTextNode(""),cl(this.text)?this._bindToObservable({schema:this.text,updater:function(t){return {set(e){t.textContent=e;},remove(){t.textContent="";}}}(e),data:t}):e.textContent=this.text.join(""),e}_renderAttributes(t){let e,n,i,o;if(!this.attributes)return;const r=t.node,s=t.revertData;for(e in this.attributes)if(i=r.getAttribute(e),n=this.attributes[e],s&&(s.attributes[e]=i),o=it(n[0])&&n[0].ns?n[0].ns:null,cl(n)){const a=o?n[0].value:n;s&&vl(e)&&a.unshift(i),this._bindToObservable({schema:a,updater:dl(r,e,o),data:t});}else"style"==e&&"string"!=typeof n[0]?this._renderStyleAttribute(n[0],t):(s&&i&&vl(e)&&n.unshift(i),bl(n=n.map(t=>t&&t.value||t).reduce((t,e)=>t.concat(e),[]).reduce(gl,""))||r.setAttributeNS(o,e,n));}_renderStyleAttribute(t,e){const n=e.node;for(const i in t){const o=t[i];cl(o)?this._bindToObservable({schema:[o],updater:ul(n,i),data:e}):n.style[i]=o;}}_renderElementChildren(t){const e=t.node,n=t.intoFragment?document.createDocumentFragment():e,i=t.isApplying;let o=0;for(const r of this.children)if(kl(r)){if(!i){r.setParent(e);for(const t of r)n.appendChild(t.element);}}else if(wl(r))i||(r.isRendered||r.render(),n.appendChild(r.element));else if(qo(r))n.appendChild(r);else if(i){const e={children:[],bindings:[],attributes:{}};t.revertData.children.push(e),r._renderNode({node:n.childNodes[o++],isApplying:!0,revertData:e});}else n.appendChild(r.render());t.intoFragment&&e.appendChild(n);}_setUpListeners(t){if(this.eventListeners)for(const e in this.eventListeners){const n=this.eventListeners[e].map(n=>{const[i,o]=e.split("@");return n.activateDomEventListener(i,o,t)});t.revertData&&t.revertData.bindings.push(n);}}_bindToObservable({schema:t,updater:e,data:n}){const i=n.revertData;ll(t,e,n);const o=t.filter(t=>!bl(t)).filter(t=>t.observable).map(i=>i.activateAttributeListener(t,e,n));i&&i.bindings.push(o);}_revertTemplateFromNode(t,e){for(const t of e.bindings)for(const e of t)e();if(e.text)t.textContent=e.text;else{for(const n in e.attributes){const i=e.attributes[n];null===i?t.removeAttribute(n):t.setAttribute(n,i);}for(let n=0;n<e.children.length;++n)this._revertTemplateFromNode(t.childNodes[n],e.children[n]);}}}F(ol,R);class rl{constructor(t){Object.assign(this,t);}getValue(t){const e=this.observable[this.attribute];return this.callback?this.callback(e,t):e}activateAttributeListener(t,e,n){const i=()=>ll(t,e,n);return this.emitter.listenTo(this.observable,"change:"+this.attribute,i),()=>{this.emitter.stopListening(this.observable,"change:"+this.attribute,i);}}}class sl extends rl{activateDomEventListener(t,e,n){const i=(t,n)=>{e&&!n.target.matches(e)||("function"==typeof this.eventNameOrFunction?this.eventNameOrFunction(n):this.observable.fire(this.eventNameOrFunction,n));};return this.emitter.listenTo(n.node,t,i),()=>{this.emitter.stopListening(n.node,t,i);}}}class al extends rl{getValue(t){return !bl(super.getValue(t))&&(this.valueIfTrue||!0)}}function cl(t){return !!t&&(t.value&&(t=t.value),Array.isArray(t)?t.some(cl):t instanceof rl)}function ll(t,e,{node:n}){let i=function(t,e){return t.map(t=>t instanceof rl?t.getValue(e):t)}(t,n);bl(i=1==t.length&&t[0]instanceof al?i[0]:i.reduce(gl,""))?e.remove():e.set(i);}function dl(t,e,n){return {set(i){t.setAttributeNS(n,e,i);},remove(){t.removeAttributeNS(n,e);}}}function ul(t,e){return {set(n){t.style[e]=n;},remove(){t.style[e]=null;}}}function hl(t){return nl(t,t=>{if(t&&(t instanceof rl||_l(t)||wl(t)||kl(t)))return t})}function fl(t){if("string"==typeof t?t=function(t){return {text:[t]}}(t):t.text&&function(t){Array.isArray(t.text)||(t.text=[t.text]);}(t),t.on&&(t.eventListeners=function(t){for(const e in t)ml(t,e);return t}(t.on),delete t.on),!t.text){t.attributes&&function(t){for(const e in t)t[e].value&&(t[e].value=[].concat(t[e].value)),ml(t,e);}(t.attributes);const e=[];if(t.children)if(kl(t.children))e.push(t.children);else for(const n of t.children)_l(n)||wl(n)||qo(n)?e.push(n):e.push(new ol(n));t.children=e;}return t}function ml(t,e){Array.isArray(t[e])||(t[e]=[t[e]]);}function gl(t,e){return bl(e)?t:bl(t)?e:`${t} ${e}`}function pl(t,e){for(const n in e)t[n]?t[n].push(...e[n]):t[n]=e[n];}function bl(t){return !t&&0!==t}function wl(t){return t instanceof yl}function _l(t){return t instanceof ol}function kl(t){return t instanceof Xc}function vl(t){return "class"==t||"style"==t}n(54);class yl{constructor(t){this.element=null,this.isRendered=!1,this.locale=t,this.t=t&&t.t,this._viewCollections=new Xi,this._unboundChildren=this.createCollection(),this._viewCollections.on("add",(e,n)=>{n.locale=t;}),this.decorate("render");}get bindTemplate(){return this._bindTemplate?this._bindTemplate:this._bindTemplate=ol.bind(this,this)}createCollection(){const t=new Xc;return this._viewCollections.add(t),t}registerChild(t){ui(t)||(t=[t]);for(const e of t)this._unboundChildren.add(e);}deregisterChild(t){ui(t)||(t=[t]);for(const e of t)this._unboundChildren.remove(e);}setTemplate(t){this.template=new ol(t);}extendTemplate(t){ol.extend(this.template,t);}render(){if(this.isRendered)throw new P.b("ui-view-render-already-rendered: This View has already been rendered.");this.template&&(this.element=this.template.render(),this.registerChild(this.template.getViews())),this.isRendered=!0;}destroy(){this.stopListening(),this._viewCollections.map(t=>t.destroy());}}F(yl,rr),F(yl,Li);n(57);class xl extends yl{constructor(t){super(t),this.body=this.createCollection();}render(){super.render(),this._renderBodyCollection();}destroy(){return this._bodyCollectionContainer.remove(),super.destroy()}_renderBodyCollection(){const t=this._bodyCollectionContainer=new ol({tag:"div",attributes:{class:["ck","ck-reset_all","ck-body","ck-rounded-corners"]},children:this.body}).render();document.body.appendChild(t);}}class Al extends yl{constructor(t,e){super(t);const n=this.bindTemplate;e&&(this.element=this.editableElement=e),this.setTemplate({tag:"div",attributes:{class:["ck","ck-content","ck-editor__editable","ck-rounded-corners",n.to("isFocused",t=>t?"ck-focused":"ck-blurred"),n.if("isReadOnly","ck-read-only")],contenteditable:n.to("isReadOnly",t=>!t)}}),this.set("isReadOnly",!1),this.set("isFocused",!1),this.externalElement=e;}render(){super.render(),this.externalElement?this.template.apply(this.element=this.externalElement):this.editableElement=this.element;}destroy(){this.externalElement&&this.template.revert(this.externalElement),super.destroy();}}class Cl extends Al{constructor(t,e){super(t,e);const n=this.bindTemplate,i=this.t;this.set("name",null);this.extendTemplate({attributes:{role:"textbox","aria-label":n.to("name",t=>i("ch",[t])),class:"ck-editor__editable_inline"}});}}class Tl{constructor(t){if(Object.assign(this,t),t.actions&&t.keystrokeHandler)for(const e in t.actions){let n=t.actions[e];"string"==typeof n&&(n=[n]);for(const i of n)t.keystrokeHandler.set(i,(t,n)=>{this[e](),n();});}}get first(){return this.focusables.find(Pl)||null}get last(){return this.focusables.filter(Pl).slice(-1)[0]||null}get next(){return this._getFocusableItem(1)}get previous(){return this._getFocusableItem(-1)}get current(){let t=null;return null===this.focusTracker.focusedElement?null:(this.focusables.find((e,n)=>{const i=e.element===this.focusTracker.focusedElement;return i&&(t=n),i}),t)}focusFirst(){this._focus(this.first);}focusLast(){this._focus(this.last);}focusNext(){this._focus(this.next);}focusPrevious(){this._focus(this.previous);}_focus(t){t&&t.focus();}_getFocusableItem(t){const e=this.current,n=this.focusables.length;if(!n)return null;if(null===e)return this[1===t?"first":"last"];let i=(e+n+t)%n;do{const e=this.focusables.get(i);if(Pl(e))return e;i=(i+n+t)%n;}while(i!==e);return null}}function Pl(t){return !(!t.focus||"none"==Jo.window.getComputedStyle(t.element).display)}class Ml extends yl{constructor(t){super(t),this.setTemplate({tag:"span",attributes:{class:["ck","ck-toolbar__separator"]}});}}n(59);class Sl extends yl{constructor(t){super(t);const e=this.bindTemplate;this.items=this.createCollection(),this.focusTracker=new Kc,this.keystrokes=new Uc,this.set("isVertical",!1),this.set("className"),this._focusCycler=new Tl({focusables:this.items,focusTracker:this.focusTracker,keystrokeHandler:this.keystrokes,actions:{focusPrevious:["arrowleft","arrowup"],focusNext:["arrowright","arrowdown"]}}),this.setTemplate({tag:"div",attributes:{class:["ck","ck-toolbar",e.if("isVertical","ck-toolbar_vertical"),e.to("className")]},children:this.items,on:{mousedown:function(t){return t.bindTemplate.to(e=>{e.target===t.element&&e.preventDefault();})}(this)}});}render(){super.render();for(const t of this.items)this.focusTracker.add(t.element);this.items.on("add",(t,e)=>{this.focusTracker.add(e.element);}),this.items.on("remove",(t,e)=>{this.focusTracker.remove(e.element);}),this.keystrokes.listenTo(this.element);}focus(){this._focusCycler.focusFirst();}focusLast(){this._focusCycler.focusLast();}fillFromConfig(t,e){t.map(t=>{"|"==t?this.items.add(new Ml):e.has(t)?this.items.add(e.create(t)):fs.a.warn("toolbarview-item-unavailable: The requested toolbar item is unavailable.",{name:t});});}}class Il extends xl{constructor(t,e){super(t),this.toolbar=new Sl(t),this.editable=new Cl(t,e),ol.extend(this.toolbar.template,{attributes:{class:["ck-reset_all","ck-rounded-corners"]}});}render(){super.render(),this.registerChild([this.toolbar,this.editable]);}get editableElement(){return this.editable.element}}class El extends qc{constructor(t,e){super(e),tr(t)&&(this.sourceElement=t),this.data.processor=new $c,this.model.document.createRoot(),this.ui=new Zc(this,new Il(this.locale,this.sourceElement));}get element(){return null}destroy(){const t=this.getData();return this.ui.destroy(),super.destroy().then(()=>{this.sourceElement&&function(t,e){t instanceof HTMLTextAreaElement&&(t.value=e),t.innerHTML=e;}(this.sourceElement,t);})}static create(t,e){return new Promise(n=>{const i=new this(t,e);n(i.initPlugins().then(()=>{i.ui.init(),i.fire("uiReady");}).then(()=>{const e=tr(t)?function(t){return t instanceof HTMLTextAreaElement?t.value:t.innerHTML}(t):t;return i.data.init(e)}).then(()=>{i.fire("dataReady"),i.fire("ready");}).then(()=>i));})}}F(El,Wc);class Nl{constructor(t){this.editor=t;}destroy(){this.stopListening();}}F(Nl,Li);class Ol{constructor(t){this.files=function(t){const e=t.files?Array.from(t.files):[],n=t.items?Array.from(t.items):[];if(e.length)return e;return n.filter(t=>"file"===t.kind).map(t=>t.getAsFile())}(t),this._native=t;}get types(){return this._native.types}getData(t){return this._native.getData(t)}setData(t,e){this._native.setData(t,e);}}class Rl extends Kr{constructor(t){super(t);const e=this.document;function n(t,n){n.preventDefault();const i=n.dropRange?[n.dropRange]:Array.from(e.selection.getRanges());e.fire("clipboardInput",{dataTransfer:n.dataTransfer,targetRanges:i});}this.domEventType=["paste","copy","cut","drop","dragover"],this.listenTo(e,"paste",n,{priority:"low"}),this.listenTo(e,"drop",n,{priority:"low"});}onDomEvent(t){const e={dataTransfer:new Ol(t.clipboardData?t.clipboardData:t.dataTransfer)};"drop"==t.type&&(e.dropRange=function(t,e){const n=e.target.ownerDocument,i=e.clientX,o=e.clientY;let r;n.caretRangeFromPoint&&n.caretRangeFromPoint(i,o)?r=n.caretRangeFromPoint(i,o):e.rangeParent&&((r=n.createRange()).setStart(e.rangeParent,e.rangeOffset),r.collapse(!0));return r?t.domConverter.domRangeToView(r):t.document.selection.getFirstRange()}(this.view,t)),this.fire(t.type,t,e);}}const Dl=["figcaption","li"];class Ll extends Nl{static get pluginName(){return "Clipboard"}init(){const t=this.editor,e=t.model.document,n=t.editing.view,i=n.document;function o(n,o){const r=o.dataTransfer;o.preventDefault();const s=t.data.toView(t.model.getSelectedContent(e.selection));i.fire("clipboardOutput",{dataTransfer:r,content:s,method:n.name});}this._htmlDataProcessor=new $c,n.addObserver(Rl),this.listenTo(i,"clipboardInput",e=>{t.isReadOnly&&e.stop();},{priority:"highest"}),this.listenTo(i,"clipboardInput",(t,e)=>{const i=e.dataTransfer;let o="";i.getData("text/html")?o=function(t){return t.replace(/<span(?: class="Apple-converted-space"|)>(\s+)<\/span>/g,(t,e)=>1==e.length?" ":e)}(i.getData("text/html")):i.getData("text/plain")&&(o=function(t){return (t=t.replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n\n/g,"</p><p>").replace(/\n/g,"<br>").replace(/^\s/,"&nbsp;").replace(/\s$/,"&nbsp;").replace(/\s\s/g," &nbsp;")).indexOf("</p><p>")>-1&&(t=`<p>${t}</p>`),t}(i.getData("text/plain"))),o=this._htmlDataProcessor.toView(o),this.fire("inputTransformation",{content:o,dataTransfer:i}),n.scrollToTheSelection();},{priority:"low"}),this.listenTo(this,"inputTransformation",(t,e)=>{if(!e.content.isEmpty){const t=this.editor.data,n=this.editor.model,i=t.toModel(e.content,"$clipboardHolder");if(0==i.childCount)return;n.insertContent(i);}},{priority:"low"}),this.listenTo(i,"copy",o,{priority:"low"}),this.listenTo(i,"cut",(e,n)=>{t.isReadOnly?n.preventDefault():o(e,n);},{priority:"low"}),this.listenTo(i,"clipboardOutput",(n,i)=>{i.content.isEmpty||(i.dataTransfer.setData("text/html",this._htmlDataProcessor.toData(i.content)),i.dataTransfer.setData("text/plain",function t(e){let n="";if(e.is("text")||e.is("textProxy"))n=e.data;else if(e.is("img")&&e.hasAttribute("alt"))n=e.getAttribute("alt");else{let i=null;for(const o of e.getChildren()){const e=t(o);i&&(i.is("containerElement")||o.is("containerElement"))&&(Dl.includes(i.name)||Dl.includes(o.name)?n+="\n":n+="\n\n"),n+=e,i=o;}}return n}(i.content))),"cut"==i.method&&t.model.deleteContent(e.selection);},{priority:"low"});}}class jl{constructor(t){this.editor=t,this.set("value",void 0),this.set("isEnabled",!1),this.decorate("execute"),this.listenTo(this.editor.model.document,"change",()=>{this.refresh();}),this.on("execute",t=>{this.isEnabled||t.stop();},{priority:"high"}),this.listenTo(t,"change:isReadOnly",(t,e,n)=>{n?(this.on("set:isEnabled",Vl,{priority:"highest"}),this.isEnabled=!1):(this.off("set:isEnabled",Vl),this.refresh());});}refresh(){this.isEnabled=!0;}execute(){}destroy(){this.stopListening();}}function Vl(t){t.return=!1,t.stop();}F(jl,Li);class zl extends jl{execute(){const t=this.editor.model,e=t.document;t.change(n=>{!function(t,e,n,i){const o=n.isCollapsed,r=n.getFirstRange(),s=r.start.parent,a=r.end.parent;if(i.isLimit(s)||i.isLimit(a))return void(o||s!=a||t.deleteContent(n));if(o)Bl(e,r.start);else{const i=!(r.start.isAtStart&&r.end.isAtEnd),o=s==a;t.deleteContent(n,{leaveUnmerged:i}),i&&(o?Bl(e,n.focus):e.setSelection(a,0));}}(this.editor.model,n,e.selection,t.schema),this.fire("afterExecute",{writer:n});});}}function Bl(t,e){t.split(e),t.setSelection(e.parent.nextSibling,0);}class Fl extends cr{constructor(t){super(t);const e=this.document;e.on("keydown",(t,n)=>{if(this.isEnabled&&n.keyCode==ho.enter){let i;e.once("enter",t=>i=t,{priority:"highest"}),e.fire("enter",new Qr(e,n.domEvent,{isSoft:n.shiftKey})),i&&i.stop.called&&t.stop();}});}observe(){}}class Ul extends Nl{static get pluginName(){return "Enter"}init(){const t=this.editor,e=t.editing.view,n=e.document;e.addObserver(Fl),t.commands.add("enter",new zl(t)),this.listenTo(n,"enter",(n,i)=>{i.preventDefault(),i.isSoft||(t.execute("enter"),e.scrollToTheSelection());},{priority:"low"});}}class Hl extends jl{execute(){const t=this.editor.model,e=t.document;t.change(n=>{!function(t,e,n){const i=n.isCollapsed,o=n.getFirstRange(),r=o.start.parent,s=o.end.parent,a=r==s;if(i)ql(e,o.end);else{const i=!(o.start.isAtStart&&o.end.isAtEnd);t.deleteContent(n,{leaveUnmerged:i}),a?ql(e,n.focus):i&&e.setSelection(s,0);}}(t,n,e.selection),this.fire("afterExecute",{writer:n});});}refresh(){const t=this.editor.model,e=t.document;this.isEnabled=function(t,e){if(e.rangeCount>1)return !1;const n=e.anchor;if(!n||!t.checkChild(n,"softBreak"))return !1;const i=e.getFirstRange(),o=i.start.parent,r=i.end.parent;if((Wl(o,t)||Wl(r,t))&&o!==r)return !1;return !0}(t.schema,e.selection);}}function ql(t,e){const n=t.createElement("softBreak");t.insert(n,e),t.setSelection(n,"after");}function Wl(t,e){return !t.is("rootElement")&&(e.isLimit(t)||Wl(t.parent,e))}class Yl extends Nl{static get pluginName(){return "ShiftEnter"}init(){const t=this.editor,e=t.model.schema,n=t.conversion,i=t.editing.view,o=i.document;e.register("softBreak",{allowWhere:"$text"}),n.for("upcast").add(Oa({model:"softBreak",view:"br"})),n.for("downcast").add(aa({model:"softBreak",view:(t,e)=>e.createEmptyElement("br")})),i.addObserver(Fl),t.commands.add("shiftEnter",new Hl(t)),this.listenTo(o,"enter",(e,n)=>{n.preventDefault(),n.isSoft&&(t.execute("shiftEnter"),i.scrollToTheSelection());},{priority:"low"});}}class $l{constructor(t,e=20){this.model=t,this.size=0,this.limit=e,this.isLocked=!1,this._changeCallback=((t,e)=>{"transparent"!=e.type&&e!==this._batch&&this._reset(!0);}),this._selectionChangeCallback=(()=>{this._reset();}),this.model.document.on("change",this._changeCallback),this.model.document.selection.on("change:range",this._selectionChangeCallback),this.model.document.selection.on("change:attribute",this._selectionChangeCallback);}get batch(){return this._batch||(this._batch=this.model.createBatch()),this._batch}input(t){this.size+=t,this.size>=this.limit&&this._reset(!0);}lock(){this.isLocked=!0;}unlock(){this.isLocked=!1;}destroy(){this.model.document.off("change",this._changeCallback),this.model.document.selection.off("change:range",this._selectionChangeCallback),this.model.document.selection.off("change:attribute",this._selectionChangeCallback);}_reset(t){this.isLocked&&!t||(this._batch=null,this.size=0);}}class Gl extends jl{constructor(t,e){super(t),this._buffer=new $l(t.model,e);}get buffer(){return this._buffer}destroy(){super.destroy(),this._buffer.destroy();}execute(t={}){const e=this.editor.model,n=e.document,i=t.text||"",o=i.length,r=t.range||n.selection.getFirstRange(),s=t.resultRange;e.enqueueChange(this._buffer.batch,t=>{const e=r.isCollapsed;this._buffer.lock(),e||t.remove(r),i&&t.insertText(i,n.selection.getAttributes(),r.start),s?t.setSelection(s):e&&t.setSelection(r.start.getShiftedBy(o)),this._buffer.unlock(),this._buffer.input(o);});}}function Ql(t){let e=null;const n=t.model,i=t.editing.view,o=t.commands.get("input");function r(){const t=o.buffer;t.lock(),n.enqueueChange(t.batch,()=>{n.deleteContent(n.document.selection);}),t.unlock();}i.document.on("keydown",(t,s)=>(function(t){const s=n.document,a=i.document.isComposing,c=e&&e.isEqual(s.selection);if(e=null,!o.isEnabled)return;if(function(t){if(t.ctrlKey)return !0;return Kl.includes(t.keyCode)}(t)||s.selection.isCollapsed)return;if(a&&229===t.keyCode)return;if(!a&&229===t.keyCode&&c)return;r();})(s),{priority:"lowest"}),i.document.on("compositionstart",function(){const t=n.document,e=1!==t.selection.rangeCount||t.selection.getFirstRange().isFlat;if(t.selection.isCollapsed||e)return;r();},{priority:"lowest"}),i.document.on("compositionend",()=>{e=n.createSelection(n.document.selection);},{priority:"lowest"});}const Kl=[fo("arrowUp"),fo("arrowRight"),fo("arrowDown"),fo("arrowLeft"),9,16,17,18,19,20,27,33,34,35,36,45,91,93,144,145,173,174,175,176,177,178,179,255];for(let t=112;t<=135;t++)Kl.push(t);function Jl(t){if(0==t.length)return !1;for(const e of t)if("children"===e.type&&!Zl(e))return !0;return !1}function Zl(t){if(t.newChildren.length-t.oldChildren.length!=1)return;const e=function(t,e){const n=[];let i,o=0;return t.forEach(t=>{"equal"==t?(r(),o++):"insert"==t?(s("insert")?i.values.push(e[o]):(r(),i={type:"insert",index:o,values:[e[o]]}),o++):s("delete")?i.howMany++:(r(),i={type:"delete",index:o,howMany:1});}),r(),n;function r(){i&&(n.push(i),i=null);}function s(t){return i&&i.type==t}}(Fo(t.oldChildren,t.newChildren,Xl),t.newChildren);if(e.length>1)return;const n=e[0];return n.values[0]&&n.values[0].is("text")?n:void 0}function Xl(t,e){return t&&t.is("text")&&e&&e.is("text")?t.data===e.data:t===e}class td{constructor(t){this.editor=t,this.editing=this.editor.editing;}handle(t,e){if(Jl(t))this._handleContainerChildrenMutations(t,e);else for(const n of t)this._handleTextMutation(n,e),this._handleTextNodeInsertion(n);}_handleContainerChildrenMutations(t,e){const n=function(t){const e=t.map(t=>t.node).reduce((t,e)=>t.getCommonAncestor(e,{includeSelf:!0}));if(!e)return;return e.getAncestors({includeSelf:!0,parentFirst:!0}).find(t=>t.is("containerElement")||t.is("rootElement"))}(t);if(!n)return;const i=this.editor.editing.view.domConverter.mapViewToDom(n),o=new er,r=this.editor.data.toModel(o.domToView(i)).getChild(0),s=this.editor.editing.mapper.toModelElement(n);if(!s)return;const a=Array.from(r.getChildren()),c=Array.from(s.getChildren()),l=a[a.length-1],d=c[c.length-1];if(l&&l.is("softBreak")&&d&&!d.is("softBreak")&&a.pop(),!ed(a)||!ed(c))return;const u=a.map(t=>t.is("text")?t.data:"@").join("").replace(/\u00A0/g," "),h=c.map(t=>t.is("text")?t.data:"@").join("").replace(/\u00A0/g," ");if(h===u)return;const f=Fo(h,u),{firstChangeAt:m,insertions:g,deletions:p}=nd(f);let b=null;e&&(b=this.editing.mapper.toModelRange(e.getFirstRange()));const w=u.substr(m,g),_=this.editor.model.createRange(this.editor.model.createPositionAt(s,m),this.editor.model.createPositionAt(s,m+p));this.editor.execute("input",{text:w,range:_,resultRange:b});}_handleTextMutation(t,e){if("text"!=t.type)return;const n=t.newText.replace(/\u00A0/g," "),i=Fo(t.oldText.replace(/\u00A0/g," "),n),{firstChangeAt:o,insertions:r,deletions:s}=nd(i);let a=null;e&&(a=this.editing.mapper.toModelRange(e.getFirstRange()));const c=this.editing.view.createPositionAt(t.node,o),l=this.editing.mapper.toModelPosition(c),d=this.editor.model.createRange(l,l.getShiftedBy(s)),u=n.substr(o,r);this.editor.execute("input",{text:u,range:d,resultRange:a});}_handleTextNodeInsertion(t){if("children"!=t.type)return;const e=Zl(t),n=this.editing.view.createPositionAt(t.node,e.index),i=this.editing.mapper.toModelPosition(n),o=e.values[0].data;this.editor.execute("input",{text:o.replace(/\u00A0/g," "),range:this.editor.model.createRange(i)});}}function ed(t){return t.every(t=>t.is("text")||t.is("softBreak"))}function nd(t){let e=null,n=null;for(let i=0;i<t.length;i++){"equal"!=t[i]&&(e=null===e?i:e,n=i);}let i=0,o=0;for(let r=e;r<=n;r++)"insert"!=t[r]&&i++,"delete"!=t[r]&&o++;return {insertions:o,deletions:i,firstChangeAt:e}}class id extends Nl{static get pluginName(){return "Input"}init(){const t=this.editor,e=new Gl(t,t.config.get("typing.undoStep")||20);t.commands.add("input",e),Ql(t),function(t){t.editing.view.document.on("mutations",(e,n,i)=>{new td(t).handle(n,i);});}(t);}}class od extends jl{constructor(t,e){super(t),this.direction=e,this._buffer=new $l(t.model,t.config.get("typing.undoStep"));}execute(t={}){const e=this.editor.model,n=e.document;e.enqueueChange(this._buffer.batch,i=>{this._buffer.lock();const o=i.createSelection(n.selection),r=o.isCollapsed;if(o.isCollapsed&&e.modifySelection(o,{direction:this.direction,unit:t.unit}),this._shouldEntireContentBeReplacedWithParagraph(t.sequence||1))return void this._replaceEntireContentWithParagraph(i);if(o.isCollapsed)return;let s=0;o.getFirstRange().getMinimalFlatRanges().forEach(t=>{s+=Ki(t.getWalker({singleCharacters:!0,ignoreElementEnd:!0,shallow:!0}));}),e.deleteContent(o,{doNotResetEntireContent:r}),this._buffer.input(s),i.setSelection(o),this._buffer.unlock();});}_shouldEntireContentBeReplacedWithParagraph(t){if(t>1)return !1;const e=this.editor.model,n=e.document.selection,i=e.schema.getLimitElement(n);if(!(n.isCollapsed&&n.containsEntireContent(i)))return !1;if(!e.schema.checkChild(i,"paragraph"))return !1;const o=i.getChild(0);return !o||"paragraph"!==o.name}_replaceEntireContentWithParagraph(t){const e=this.editor.model,n=e.document.selection,i=e.schema.getLimitElement(n),o=t.createElement("paragraph");t.remove(t.createRangeIn(i)),t.insert(o,i),t.setSelection(o,0);}}class rd extends cr{constructor(t){super(t);const e=t.document;let n=0;e.on("keyup",(t,e)=>{e.keyCode!=ho.delete&&e.keyCode!=ho.backspace||(n=0);}),e.on("keydown",(t,i)=>{const o={};if(i.keyCode==ho.delete)o.direction="forward",o.unit="character";else{if(i.keyCode!=ho.backspace)return;o.direction="backward",o.unit="codePoint";}const r=co.isMac?i.altKey:i.ctrlKey;let s;o.unit=r?"word":o.unit,o.sequence=++n,e.once("delete",t=>s=t,{priority:"highest"}),e.fire("delete",new Qr(e,i.domEvent,o)),s&&s.stop.called&&t.stop();});}observe(){}}function sd(t){const e=t.model,n=t.editing.view,i=200;let o=null,r=e.createSelection(e.document.selection),s=Date.now();e.document.selection.on("change",function(t){const n=e.createSelection(t.source);r.isEqual(n)||(o=r,r=n,s=Date.now());}),n.document.on("mutations",function(n,a){Jl(a)&&function(t){for(const e of t){if("children"!==e.type)continue;const t=e.oldChildren,n=e.newChildren;if(!ad(t))continue;const i=Fo(t,n),o=i.some(t=>"delete"===t),r=i.some(t=>"insert"===t);if(o&&!r)return !0}return !1}(a)&&(!function(){Date.now()-s<i&&o&&!o.isCollapsed&&r.isCollapsed&&r.getLastPosition().isEqual(o.getLastPosition())&&e.enqueueChange(t=>{t.setSelection(o);});t.execute("delete");}(),n.stop());},{priority:"highest"});}function ad(t){return t.every(t=>t.is("containerElement"))}class cd extends Nl{static get pluginName(){return "Delete"}init(){const t=this.editor,e=t.editing.view,n=e.document;e.addObserver(rd),t.commands.add("forwardDelete",new od(t,"forward")),t.commands.add("delete",new od(t,"backward")),this.listenTo(n,"delete",(n,i)=>{t.execute("forward"==i.direction?"forwardDelete":"delete",{unit:i.unit,sequence:i.sequence}),i.preventDefault(),e.scrollToTheSelection();}),sd(t);}}class ld extends Nl{static get requires(){return [id,cd]}static get pluginName(){return "Typing"}}class dd extends qa{get type(){return "noop"}clone(){return new dd(this.baseVersion)}getReversed(){return new dd(this.baseVersion+1)}_execute(){}static get className(){return "NoOperation"}}const ud=new Map;function hd(t,e,n){let i=ud.get(t);i||(i=new Map,ud.set(t,i)),i.set(e,n);}function fd(t){return [t]}function md(t,e,n={}){const i=function(t,e){const n=ud.get(t);return n&&n.has(e)?n.get(e):fd}(t.constructor,e.constructor);try{return i(t=t.clone(),e,n)}catch(i){throw fs.a.error("Error during operation transformation!",i.message),fs.a.error("Transformed operation",t),fs.a.error("Operation transformed by",e),fs.a.error("context.aIsStrong",n.aIsStrong),fs.a.error("context.aWasUndone",n.aWasUndone),fs.a.error("context.bWasUndone",n.bWasUndone),fs.a.error("context.abRelation",n.abRelation),fs.a.error("context.baRelation",n.baRelation),i}}function gd(t,e,n){if(t=t.slice(),e=e.slice(),0==t.length||0==e.length)return {operationsA:t,operationsB:e};const i=new WeakMap;for(const e of t)i.set(e,0);const o={nextBaseVersionA:t[t.length-1].baseVersion+1,nextBaseVersionB:e[e.length-1].baseVersion+1,originalOperationsACount:t.length,originalOperationsBCount:e.length},r=new pd(n.document,n.useRelations);r.setOriginalOperations(t),r.setOriginalOperations(e);let s=0;for(;s<t.length;){const n=t[s],o=i.get(n);if(o==e.length){s++;continue}const a=e[o],c=md(n,a,r.getContext(n,a,!0)),l=md(a,n,r.getContext(a,n,!1));r.updateRelation(n,a),r.setOriginalOperations(c,n),r.setOriginalOperations(l,a);for(const t of c)i.set(t,o+l.length);t.splice(s,1,...c),e.splice(o,1,...l);}if(n.padWithNoOps){const n=t.length-o.originalOperationsACount,i=e.length-o.originalOperationsBCount;wd(t,i-n),wd(e,n-i);}return bd(t,o.nextBaseVersionB),bd(e,o.nextBaseVersionA),{operationsA:t,operationsB:e}}class pd{constructor(t,e){this._history=t.history,this._useRelations=e,this._originalOperations=new Map,this._relations=new Map;}setOriginalOperations(t,e=null){const n=e?this._originalOperations.get(e):null;for(const e of t)this._originalOperations.set(e,n||e);}updateRelation(t,e){switch(t.constructor){case nc:switch(e.constructor){case ac:t.targetPosition.isEqual(e.sourcePosition)||e.movedRange.containsPosition(t.targetPosition)?this._setRelation(t,e,"insertAtSource"):t.targetPosition.isEqual(e.deletionPosition)?this._setRelation(t,e,"insertBetween"):t.targetPosition.isAfter(e.sourcePosition)&&this._setRelation(t,e,"moveTargetAfter");break;case nc:t.targetPosition.isEqual(e.sourcePosition)||t.targetPosition.isBefore(e.sourcePosition)?this._setRelation(t,e,"insertBefore"):this._setRelation(t,e,"insertAfter");}break;case cc:switch(e.constructor){case ac:t.splitPosition.isBefore(e.sourcePosition)&&this._setRelation(t,e,"splitBefore");break;case nc:(t.splitPosition.isEqual(e.sourcePosition)||t.splitPosition.isBefore(e.sourcePosition))&&this._setRelation(t,e,"splitBefore");}break;case ac:switch(e.constructor){case ac:t.targetPosition.isEqual(e.sourcePosition)||this._setRelation(t,e,"mergeTargetNotMoved"),t.sourcePosition.isEqual(e.sourcePosition)&&this._setRelation(t,e,"mergeSameElement");break;case cc:t.sourcePosition.isEqual(e.splitPosition)&&this._setRelation(t,e,"splitAtSource");}}}getContext(t,e,n){return {aIsStrong:n,aWasUndone:this._wasUndone(t),bWasUndone:this._wasUndone(e),abRelation:this._useRelations?this._getRelation(t,e):null,baRelation:this._useRelations?this._getRelation(e,t):null}}_wasUndone(t){const e=this._originalOperations.get(t);return e.wasUndone||this._history.isUndoneOperation(e)}_getRelation(t,e){const n=this._originalOperations.get(e),i=this._history.getUndoneOperation(n);if(!i)return null;const o=this._originalOperations.get(t),r=this._relations.get(o);return r&&r.get(i)||null}_setRelation(t,e,n){const i=this._originalOperations.get(t),o=this._originalOperations.get(e);let r=this._relations.get(i);r||(r=new Map,this._relations.set(i,r)),r.set(o,n);}}function bd(t,e){for(const n of t)n.baseVersion=e++;}function wd(t,e){for(let n=0;n<e;n++)t.push(new dd(0));}function _d(t,e,n){const i=t.nodes.getNode(0).getAttribute(e);if(i==n)return null;const o=new qs(t.position,t.position.getShiftedBy(t.howMany));return new tc(o,e,i,n,0)}function kd(t,e){return null===t.targetPosition._getTransformedByDeletion(e.sourcePosition,e.howMany)}function vd(t,e){const n=[];for(let i=0;i<t.length;i++){const o=t[i],r=new nc(o.start,o.end.offset-o.start.offset,e.isEqual(o.end)?o.start:e,0);n.push(r);for(let e=i+1;e<t.length;e++)t[e]=t[e]._getTransformedByMove(r.sourcePosition,r.targetPosition,r.howMany)[0];e=e._getTransformedByMove(r.sourcePosition,r.targetPosition,r.howMany);}return n}hd(tc,tc,(t,e,n)=>{if(t.key===e.key){const i=t.range.getDifference(e.range).map(e=>new tc(e,t.key,t.oldValue,t.newValue,0)),o=t.range.getIntersection(e.range);return o&&n.aIsStrong&&i.push(new tc(o,e.key,e.newValue,t.newValue,0)),0==i.length?[new dd(0)]:i}return [t]}),hd(tc,ic,(t,e)=>{if(t.range.start.hasSameParentAs(e.position)&&t.range.containsPosition(e.position)){const n=t.range._getTransformedByInsertion(e.position,e.howMany,!e.shouldReceiveAttributes).map(e=>new tc(e,t.key,t.oldValue,t.newValue,t.baseVersion));if(e.shouldReceiveAttributes){const i=_d(e,t.key,t.oldValue);i&&n.unshift(i);}return n}return t.range=t.range._getTransformedByInsertion(e.position,e.howMany,!1)[0],[t]}),hd(tc,ac,(t,e)=>{const n=[];t.range.start.hasSameParentAs(e.deletionPosition)&&(t.range.containsPosition(e.deletionPosition)||t.range.start.isEqual(e.deletionPosition))&&n.push(qs._createFromPositionAndShift(e.graveyardPosition,1));const i=t.range._getTransformedByMergeOperation(e);return i.isCollapsed||n.push(i),n.map(e=>new tc(e,t.key,t.oldValue,t.newValue,t.baseVersion))}),hd(tc,nc,(t,e)=>{return function(t,e){const n=qs._createFromPositionAndShift(e.sourcePosition,e.howMany);let i=null,o=[];n.containsRange(t,!0)?i=t:t.start.hasSameParentAs(n.start)?(o=t.getDifference(n),i=t.getIntersection(n)):o=[t];const r=[];for(let t of o){t=t._getTransformedByDeletion(e.sourcePosition,e.howMany);const n=e.getMovedRangeStart(),i=t.start.hasSameParentAs(n);t=t._getTransformedByInsertion(n,e.howMany,i),r.push(...t);}i&&r.push(i._getTransformedByMove(e.sourcePosition,e.targetPosition,e.howMany,!1)[0]);return r}(t.range,e).map(e=>new tc(e,t.key,t.oldValue,t.newValue,t.baseVersion))}),hd(tc,cc,(t,e)=>{if(t.range.end.isEqual(e.insertionPosition))return e.graveyardPosition||t.range.end.offset++,[t];if(t.range.start.hasSameParentAs(e.splitPosition)&&t.range.containsPosition(e.splitPosition)){const n=t.clone();return n.range=new qs(e.moveTargetPosition.clone(),t.range.end._getCombined(e.splitPosition,e.moveTargetPosition)),t.range.end=e.splitPosition.clone(),t.range.end.stickiness="toPrevious",[t,n]}return t.range=t.range._getTransformedBySplitOperation(e),[t]}),hd(ic,tc,(t,e)=>{const n=[t];if(t.shouldReceiveAttributes&&t.position.hasSameParentAs(e.range.start)&&e.range.containsPosition(t.position)){const i=_d(t,e.key,e.newValue);i&&n.push(i);}return n}),hd(ic,ic,(t,e,n)=>t.position.isEqual(e.position)&&n.aIsStrong?[t]:(t.position=t.position._getTransformedByInsertOperation(e),[t])),hd(ic,nc,(t,e)=>(t.position=t.position._getTransformedByMoveOperation(e),[t])),hd(ic,cc,(t,e)=>(t.position=t.position._getTransformedBySplitOperation(e),[t])),hd(ic,ac,(t,e)=>(t.position=t.position._getTransformedByMergeOperation(e),[t])),hd(oc,ic,(t,e)=>(t.oldRange&&(t.oldRange=t.oldRange._getTransformedByInsertOperation(e)[0]),t.newRange&&(t.newRange=t.newRange._getTransformedByInsertOperation(e)[0]),[t])),hd(oc,oc,(t,e,n)=>{if(t.name==e.name){if(!n.aIsStrong)return [new dd(0)];t.oldRange=e.newRange?e.newRange.clone():null;}return [t]}),hd(oc,ac,(t,e)=>(t.oldRange&&(t.oldRange=t.oldRange._getTransformedByMergeOperation(e)),t.newRange&&(t.newRange=t.newRange._getTransformedByMergeOperation(e)),[t])),hd(oc,nc,(t,e)=>(t.oldRange&&(t.oldRange=qs._createFromRanges(t.oldRange._getTransformedByMoveOperation(e))),t.newRange&&(t.newRange=qs._createFromRanges(t.newRange._getTransformedByMoveOperation(e))),[t])),hd(oc,cc,(t,e)=>(t.oldRange&&(t.oldRange=t.oldRange._getTransformedBySplitOperation(e)),t.newRange&&(t.newRange=t.newRange._getTransformedBySplitOperation(e)),[t])),hd(ac,ic,(t,e)=>(t.sourcePosition.hasSameParentAs(e.position)&&(t.howMany+=e.howMany),t.sourcePosition=t.sourcePosition._getTransformedByInsertOperation(e),t.targetPosition=t.targetPosition._getTransformedByInsertOperation(e),[t])),hd(ac,ac,(t,e,n)=>{if(t.sourcePosition.isEqual(e.sourcePosition)&&t.targetPosition.isEqual(e.targetPosition)){if(n.bWasUndone){const n=e.graveyardPosition.path.slice();return n.push(0),t.sourcePosition=new Hs(e.graveyardPosition.root,n),t.howMany=0,[t]}return [new dd(0)]}if(t.sourcePosition.isEqual(e.sourcePosition)&&!t.targetPosition.isEqual(e.targetPosition)&&!n.bWasUndone&&"splitAtSource"!=n.abRelation){const i="$graveyard"==t.targetPosition.root.rootName,o="$graveyard"==e.targetPosition.root.rootName;if(o&&!i||!(i&&!o)&&n.aIsStrong){const n=e.targetPosition._getTransformedByMergeOperation(e),i=t.targetPosition._getTransformedByMergeOperation(e);return [new nc(n,t.howMany,i,0)]}return [new dd(0)]}return t.sourcePosition.hasSameParentAs(e.targetPosition)&&(t.howMany+=e.howMany),t.sourcePosition=t.sourcePosition._getTransformedByMergeOperation(e),t.targetPosition=t.targetPosition._getTransformedByMergeOperation(e),t.graveyardPosition.isEqual(e.graveyardPosition)&&n.aIsStrong||(t.graveyardPosition=t.graveyardPosition._getTransformedByMergeOperation(e)),[t]}),hd(ac,nc,(t,e,n)=>{const i=qs._createFromPositionAndShift(e.sourcePosition,e.howMany);return "remove"==e.type&&!n.bWasUndone&&t.deletionPosition.hasSameParentAs(e.sourcePosition)&&i.containsPosition(t.sourcePosition)?[new dd(0)]:(t.sourcePosition.hasSameParentAs(e.targetPosition)&&(t.howMany+=e.howMany),t.sourcePosition.hasSameParentAs(e.sourcePosition)&&(t.howMany-=e.howMany),t.sourcePosition=t.sourcePosition._getTransformedByMoveOperation(e),t.targetPosition=t.targetPosition._getTransformedByMoveOperation(e),t.graveyardPosition.isEqual(e.targetPosition)||(t.graveyardPosition=t.graveyardPosition._getTransformedByMoveOperation(e)),[t])}),hd(ac,cc,(t,e,n)=>{if(e.graveyardPosition&&(t.graveyardPosition=t.graveyardPosition._getTransformedByDeletion(e.graveyardPosition,1),t.deletionPosition.isEqual(e.graveyardPosition)&&(t.howMany=e.howMany)),t.targetPosition.isEqual(e.splitPosition)){const i=0!=e.howMany,o=e.graveyardPosition&&t.deletionPosition.isEqual(e.graveyardPosition);if(i||o||"mergeTargetNotMoved"==n.abRelation)return t.sourcePosition=t.sourcePosition._getTransformedBySplitOperation(e),[t]}return t.sourcePosition.isEqual(e.splitPosition)&&("mergeSameElement"==n.abRelation||t.sourcePosition.offset>0)?(t.sourcePosition=e.moveTargetPosition.clone(),t.targetPosition=t.targetPosition._getTransformedBySplitOperation(e),[t]):(t.sourcePosition.hasSameParentAs(e.splitPosition)&&(t.howMany=e.splitPosition.offset),t.sourcePosition=t.sourcePosition._getTransformedBySplitOperation(e),t.targetPosition=t.targetPosition._getTransformedBySplitOperation(e),[t])}),hd(nc,ic,(t,e)=>{const n=qs._createFromPositionAndShift(t.sourcePosition,t.howMany)._getTransformedByInsertOperation(e,!1)[0];return t.sourcePosition=n.start,t.howMany=n.end.offset-n.start.offset,t.targetPosition.isEqual(e.position)||(t.targetPosition=t.targetPosition._getTransformedByInsertOperation(e)),[t]}),hd(nc,nc,(t,e,n)=>{const i=qs._createFromPositionAndShift(t.sourcePosition,t.howMany),o=qs._createFromPositionAndShift(e.sourcePosition,e.howMany);let r,s=n.aIsStrong,a=!n.aIsStrong;if("insertBefore"==n.abRelation||"insertAfter"==n.baRelation?a=!0:"insertAfter"!=n.abRelation&&"insertBefore"!=n.baRelation||(a=!1),r=t.targetPosition.isEqual(e.targetPosition)&&a?t.targetPosition._getTransformedByDeletion(e.sourcePosition,e.howMany):t.targetPosition._getTransformedByMove(e.sourcePosition,e.targetPosition,e.howMany),kd(t,e)&&kd(e,t))return [e.getReversed()];if(i.containsPosition(e.targetPosition)&&i.containsRange(o,!0))return i.start=i.start._getTransformedByMove(e.sourcePosition,e.targetPosition,e.howMany),i.end=i.end._getTransformedByMove(e.sourcePosition,e.targetPosition,e.howMany),vd([i],r);if(o.containsPosition(t.targetPosition)&&o.containsRange(i,!0))return i.start=i.start._getCombined(e.sourcePosition,e.getMovedRangeStart()),i.end=i.end._getCombined(e.sourcePosition,e.getMovedRangeStart()),vd([i],r);const c=U(t.sourcePosition.getParentPath(),e.sourcePosition.getParentPath());if("prefix"==c||"extension"==c)return i.start=i.start._getTransformedByMove(e.sourcePosition,e.targetPosition,e.howMany),i.end=i.end._getTransformedByMove(e.sourcePosition,e.targetPosition,e.howMany),vd([i],r);"remove"!=t.type||"remove"==e.type||n.aWasUndone?"remove"==t.type||"remove"!=e.type||n.bWasUndone||(s=!1):s=!0;const l=[],d=i.getDifference(o);for(const t of d){t.start=t.start._getTransformedByDeletion(e.sourcePosition,e.howMany),t.end=t.end._getTransformedByDeletion(e.sourcePosition,e.howMany);const n="same"==U(t.start.getParentPath(),e.getMovedRangeStart().getParentPath()),i=t._getTransformedByInsertion(e.getMovedRangeStart(),e.howMany,n);l.push(...i);}const u=i.getIntersection(o);return null!==u&&s&&(u.start=u.start._getCombined(e.sourcePosition,e.getMovedRangeStart()),u.end=u.end._getCombined(e.sourcePosition,e.getMovedRangeStart()),0===l.length?l.push(u):1==l.length?o.start.isBefore(i.start)||o.start.isEqual(i.start)?l.unshift(u):l.push(u):l.splice(1,0,u)),0===l.length?[new dd(t.baseVersion)]:vd(l,r)}),hd(nc,cc,(t,e,n)=>{let i=t.targetPosition.clone();t.targetPosition.isEqual(e.insertionPosition)&&e.graveyardPosition&&"moveTargetAfter"!=n.abRelation||(i=t.targetPosition._getTransformedBySplitOperation(e));const o=qs._createFromPositionAndShift(t.sourcePosition,t.howMany);if(o.end.isEqual(e.insertionPosition))return e.graveyardPosition||t.howMany++,t.targetPosition=i,[t];if(o.start.hasSameParentAs(e.splitPosition)&&o.containsPosition(e.splitPosition)){let t=new qs(e.splitPosition,o.end);return t=t._getTransformedBySplitOperation(e),vd([new qs(o.start,e.splitPosition),t],i)}t.targetPosition.isEqual(e.splitPosition)&&"insertAtSource"==n.abRelation&&(i=e.moveTargetPosition),t.targetPosition.isEqual(e.insertionPosition)&&"insertBetween"==n.abRelation&&(i=t.targetPosition);const r=[o._getTransformedBySplitOperation(e)];if(e.graveyardPosition){const n=o.start.isEqual(e.graveyardPosition)||o.containsPosition(e.graveyardPosition);t.howMany>1&&n&&r.push(qs._createFromPositionAndShift(e.insertionPosition,1));}return vd(r,i)}),hd(nc,ac,(t,e,n)=>{const i=qs._createFromPositionAndShift(t.sourcePosition,t.howMany);if(e.deletionPosition.hasSameParentAs(t.sourcePosition)&&i.containsPosition(e.sourcePosition))if("remove"==t.type){if(!n.aWasUndone){const n=[];let i=e.graveyardPosition.clone(),o=e.targetPosition.clone();t.howMany>1&&(n.push(new nc(t.sourcePosition,t.howMany-1,t.targetPosition,0)),i=i._getTransformedByInsertion(t.targetPosition,t.howMany-1),o=o._getTransformedByMove(t.sourcePosition,t.targetPosition,t.howMany-1));const r=e.deletionPosition._getCombined(t.sourcePosition,t.targetPosition),s=new nc(i,1,r,0),a=s.getMovedRangeStart().path.slice();a.push(0);const c=new Hs(s.targetPosition.root,a),l=new nc(o,e.howMany,c,0);return n.push(s),n.push(l),n}}else if(1==t.howMany)return n.bWasUndone?(t.sourcePosition=e.graveyardPosition.clone(),t.targetPosition=t.targetPosition._getTransformedByMergeOperation(e),[t]):[new dd(0)];const o=qs._createFromPositionAndShift(t.sourcePosition,t.howMany)._getTransformedByMergeOperation(e);return t.sourcePosition=o.start,t.howMany=o.end.offset-o.start.offset,t.targetPosition=t.targetPosition._getTransformedByMergeOperation(e),[t]}),hd(rc,ic,(t,e)=>(t.position=t.position._getTransformedByInsertOperation(e),[t])),hd(rc,ac,(t,e)=>t.position.isEqual(e.deletionPosition)?(t.position=e.graveyardPosition.clone(),t.position.stickiness="toNext",[t]):(t.position=t.position._getTransformedByMergeOperation(e),[t])),hd(rc,nc,(t,e)=>(t.position=t.position._getTransformedByMoveOperation(e),[t])),hd(rc,rc,(t,e,n)=>{if(t.position.isEqual(e.position)){if(!n.aIsStrong)return [new dd(0)];t.oldName=e.newName;}return [t]}),hd(rc,cc,(t,e)=>{if("same"==U(t.position.path,e.splitPosition.getParentPath())&&!e.graveyardPosition){return [t,new rc(t.position.getShiftedBy(1),t.oldName,t.newName,0)]}return t.position=t.position._getTransformedBySplitOperation(e),[t]}),hd(sc,sc,(t,e,n)=>{if(t.root===e.root&&t.key===e.key){if(!n.aIsStrong||t.newValue===e.newValue)return [new dd(0)];t.oldValue=e.newValue;}return [t]}),hd(cc,ic,(t,e)=>(t.splitPosition.hasSameParentAs(e.position)&&t.splitPosition.offset<e.position.offset&&(t.howMany+=e.howMany),t.splitPosition=t.splitPosition._getTransformedByInsertOperation(e),t.insertionPosition=cc.getInsertionPosition(t.splitPosition),[t])),hd(cc,ac,(t,e,n)=>{if(!t.graveyardPosition&&!n.bWasUndone&&t.splitPosition.hasSameParentAs(e.sourcePosition)){const n=e.graveyardPosition.path.slice();n.push(0);const i=new Hs(e.graveyardPosition.root,n),o=cc.getInsertionPosition(new Hs(e.graveyardPosition.root,n)),r=new cc(i,0,null,0);return r.insertionPosition=o,t.splitPosition=t.splitPosition._getTransformedByMergeOperation(e),t.insertionPosition=cc.getInsertionPosition(t.splitPosition),t.graveyardPosition=r.insertionPosition.clone(),t.graveyardPosition.stickiness="toNext",[r,t]}return t.splitPosition.hasSameParentAs(e.deletionPosition)&&!t.splitPosition.isAfter(e.deletionPosition)&&t.howMany--,t.splitPosition.hasSameParentAs(e.targetPosition)&&(t.howMany+=e.howMany),t.splitPosition=t.splitPosition._getTransformedByMergeOperation(e),t.insertionPosition=cc.getInsertionPosition(t.splitPosition),t.graveyardPosition&&(t.graveyardPosition=t.graveyardPosition._getTransformedByMergeOperation(e)),[t]}),hd(cc,nc,(t,e,n)=>{const i=qs._createFromPositionAndShift(e.sourcePosition,e.howMany);if(t.graveyardPosition){if(i.start.isEqual(t.graveyardPosition)||i.containsPosition(t.graveyardPosition)){const n=t.splitPosition._getTransformedByMoveOperation(e),i=t.graveyardPosition._getTransformedByMoveOperation(e),o=i.path.slice();o.push(0);const r=new Hs(i.root,o);return [new nc(n,t.howMany,r,0)]}t.graveyardPosition=t.graveyardPosition._getTransformedByMoveOperation(e);}if(t.splitPosition.hasSameParentAs(e.sourcePosition)&&i.containsPosition(t.splitPosition)){const n=e.howMany-(t.splitPosition.offset-e.sourcePosition.offset);return t.howMany-=n,t.splitPosition.hasSameParentAs(e.targetPosition)&&t.splitPosition.offset<e.targetPosition.offset&&(t.howMany+=e.howMany),t.splitPosition=e.sourcePosition.clone(),t.insertionPosition=cc.getInsertionPosition(t.splitPosition),[t]}return !t.splitPosition.isEqual(e.targetPosition)||"insertAtSource"!=n.baRelation&&"splitBefore"!=n.abRelation?(e.sourcePosition.isEqual(e.targetPosition)||(t.splitPosition.hasSameParentAs(e.sourcePosition)&&t.splitPosition.offset<=e.sourcePosition.offset&&(t.howMany-=e.howMany),t.splitPosition.hasSameParentAs(e.targetPosition)&&t.splitPosition.offset<e.targetPosition.offset&&(t.howMany+=e.howMany)),t.splitPosition.stickiness="toNone",t.splitPosition=t.splitPosition._getTransformedByMoveOperation(e),t.splitPosition.stickiness="toNext",t.graveyardPosition?t.insertionPosition=t.insertionPosition._getTransformedByMoveOperation(e):t.insertionPosition=cc.getInsertionPosition(t.splitPosition),[t]):(t.howMany+=e.howMany,t.splitPosition=t.splitPosition._getTransformedByDeletion(e.sourcePosition,e.howMany),t.insertionPosition=cc.getInsertionPosition(t.splitPosition),[t])}),hd(cc,cc,(t,e,n)=>{if(t.splitPosition.isEqual(e.splitPosition)){if(!t.graveyardPosition&&!e.graveyardPosition)return [new dd(0)];if(t.graveyardPosition&&e.graveyardPosition&&t.graveyardPosition.isEqual(e.graveyardPosition))return [new dd(0)]}if(t.graveyardPosition&&e.graveyardPosition&&t.graveyardPosition.isEqual(e.graveyardPosition)){const i="$graveyard"==t.splitPosition.root.rootName,o="$graveyard"==e.splitPosition.root.rootName;if(o&&!i||!(i&&!o)&&n.aIsStrong){const n=[];return e.howMany&&n.push(new nc(e.moveTargetPosition,e.howMany,e.splitPosition,0)),t.howMany&&n.push(new nc(t.splitPosition,t.howMany,t.moveTargetPosition,0)),n}return [new dd(0)]}if(t.graveyardPosition&&(t.graveyardPosition=t.graveyardPosition._getTransformedBySplitOperation(e)),t.splitPosition.isEqual(e.insertionPosition)&&"splitBefore"==n.abRelation)return t.howMany++,[t];if(e.splitPosition.isEqual(t.insertionPosition)&&"splitBefore"==n.baRelation){const n=e.insertionPosition.path.slice();n.push(0);const i=new Hs(e.insertionPosition.root,n);return [t,new nc(t.insertionPosition,1,i,0)]}return t.splitPosition.hasSameParentAs(e.splitPosition)&&t.splitPosition.offset<e.splitPosition.offset&&(t.howMany-=e.howMany),t.splitPosition=t.splitPosition._getTransformedBySplitOperation(e),t.insertionPosition=cc.getInsertionPosition(t.splitPosition),[t]});class yd extends jl{constructor(t){super(t),this._stack=[],this._createdBatches=new WeakSet,this.refresh();}refresh(){this.isEnabled=this._stack.length>0;}addBatch(t){const e=this.editor.model.document.selection,n={ranges:e.hasOwnRange?Array.from(e.getRanges()):[],isBackward:e.isBackward};this._stack.push({batch:t,selection:n}),this.refresh();}clearStack(){this._stack=[],this.refresh();}_restoreSelection(t,e,n){const i=this.editor.model,o=i.document,r=[];for(const e of t){const t=xd(e,n).find(t=>t.start.root!=o.graveyard);t&&r.push(t);}r.length&&i.change(t=>{t.setSelection(r,{backward:e});});}_undo(t,e){const n=this.editor.model,i=n.document;this._createdBatches.add(e);const o=t.operations.slice().filter(t=>t.isDocumentOperation);o.reverse();for(const t of o){const o=t.baseVersion+1,r=Array.from(i.history.getOperations(o)),s=gd([t.getReversed()],r,{useRelations:!0,document:this.editor.model.document,padWithNoOps:!1}).operationsA;for(const o of s)e.addOperation(o),n.applyOperation(o),i.history.setOperationAsUndone(t,o);}}}function xd(t,e){const n=t.getTransformedByOperations(e);n.sort((t,e)=>t.start.isBefore(e.start)?-1:1);for(let t=1;t<n.length;t++){const e=n[t-1],i=n[t];e.end.isTouching(i.start)&&(e.end=i.end,n.splice(t,1),t--);}return n}class Ad extends yd{execute(t=null){const e=t?this._stack.findIndex(e=>e.batch==t):this._stack.length-1,n=this._stack.splice(e,1)[0],i=this.editor.model.createBatch();this.editor.model.enqueueChange(i,()=>{this._undo(n.batch,i);const t=this.editor.model.document.history.getOperations(n.batch.baseVersion);this._restoreSelection(n.selection.ranges,n.selection.isBackward,t),this.fire("revert",n.batch,i);}),this.refresh();}}class Cd extends yd{execute(){const t=this._stack.pop(),e=this.editor.model.createBatch();this.editor.model.enqueueChange(e,()=>{const n=t.batch.operations[t.batch.operations.length-1].baseVersion+1,i=this.editor.model.document.history.getOperations(n);this._restoreSelection(t.selection.ranges,t.selection.isBackward,i),this._undo(t.batch,e);}),this.refresh();}}class Td extends Nl{constructor(t){super(t),this._batchRegistry=new WeakSet;}init(){const t=this.editor;this._undoCommand=new Ad(t),this._redoCommand=new Cd(t),t.commands.add("undo",this._undoCommand),t.commands.add("redo",this._redoCommand),this.listenTo(t.model,"applyOperation",(t,e)=>{const n=e[0];if(!n.isDocumentOperation)return;const i=n.batch;this._batchRegistry.has(i)||"transparent"==i.type||(this._redoCommand._createdBatches.has(i)?this._undoCommand.addBatch(i):this._undoCommand._createdBatches.has(i)||(this._undoCommand.addBatch(i),this._redoCommand.clearStack()),this._batchRegistry.add(i));},{priority:"highest"}),this.listenTo(this._undoCommand,"revert",(t,e,n)=>{this._redoCommand.addBatch(n);}),t.keystrokes.set("CTRL+Z","undo"),t.keystrokes.set("CTRL+Y","redo"),t.keystrokes.set("CTRL+SHIFT+Z","redo");}}n(61);class Pd extends yl{constructor(){super();const t=this.bindTemplate;this.set("content",""),this.set("viewBox","0 0 20 20"),this.set("fillColor",""),this.setTemplate({tag:"svg",ns:"http://www.w3.org/2000/svg",attributes:{class:["ck","ck-icon"],viewBox:t.to("viewBox")}});}render(){super.render(),this._updateXMLContent(),this._colorFillPaths(),this.on("change:content",()=>{this._updateXMLContent(),this._colorFillPaths();}),this.on("change:fillColor",()=>{this._colorFillPaths();});}_updateXMLContent(){if(this.content){const t=(new DOMParser).parseFromString(this.content.trim(),"image/svg+xml").querySelector("svg"),e=t.getAttribute("viewBox");for(e&&(this.viewBox=e),this.element.innerHTML="";t.childNodes.length>0;)this.element.appendChild(t.childNodes[0]);}}_colorFillPaths(){this.fillColor&&this.element.querySelectorAll(".ck-icon__fill").forEach(t=>{t.style.fill=this.fillColor;});}}n(63);class Md extends yl{constructor(t){super(t),this.set("text",""),this.set("position","s");const e=this.bindTemplate;this.setTemplate({tag:"span",attributes:{class:["ck","ck-tooltip",e.to("position",t=>"ck-tooltip_"+t),e.if("text","ck-hidden",t=>!t.trim())]},children:[{tag:"span",attributes:{class:["ck","ck-tooltip__text"]},children:[{text:e.to("text")}]}]});}}n(65);class Sd extends yl{constructor(t){super(t);const e=this.bindTemplate,n=I();this.set("class"),this.set("labelStyle"),this.set("icon"),this.set("isEnabled",!0),this.set("isOn",!1),this.set("isVisible",!0),this.set("keystroke"),this.set("label"),this.set("tabindex",-1),this.set("tooltip"),this.set("tooltipPosition","s"),this.set("type","button"),this.set("withText",!1),this.children=this.createCollection(),this.tooltipView=this._createTooltipView(),this.labelView=this._createLabelView(n),this.iconView=new Pd,this.iconView.extendTemplate({attributes:{class:"ck-button__icon"}}),this.bind("_tooltipString").to(this,"tooltip",this,"label",this,"keystroke",this._getTooltipString.bind(this)),this.setTemplate({tag:"button",attributes:{class:["ck","ck-button",e.to("class"),e.if("isEnabled","ck-disabled",t=>!t),e.if("isVisible","ck-hidden",t=>!t),e.to("isOn",t=>t?"ck-on":"ck-off"),e.if("withText","ck-button_with-text")],type:e.to("type",t=>t||"button"),tabindex:e.to("tabindex"),"aria-labelledby":`ck-editor__aria-label_${n}`,"aria-disabled":e.if("isEnabled",!0,t=>!t),"aria-pressed":e.if("isOn",!0)},children:this.children,on:{mousedown:e.to(t=>{t.preventDefault();}),click:e.to(t=>{this.isEnabled?this.fire("execute"):t.preventDefault();})}});}render(){super.render(),this.icon&&(this.iconView.bind("content").to(this,"icon"),this.children.add(this.iconView)),this.children.add(this.tooltipView),this.children.add(this.labelView);}focus(){this.element.focus();}_createTooltipView(){const t=new Md;return t.bind("text").to(this,"_tooltipString"),t.bind("position").to(this,"tooltipPosition"),t}_createLabelView(t){const e=new yl,n=this.bindTemplate;return e.setTemplate({tag:"span",attributes:{class:["ck","ck-button__label"],style:n.to("labelStyle"),id:`ck-editor__aria-label_${t}`},children:[{text:this.bindTemplate.to("label")}]}),e}_getTooltipString(t,e,n){return t?"string"==typeof t?t:(n&&(n=function(t){return co.isMac?go(t).map(t=>uo[t.toLowerCase()]||t).reduce((t,e)=>t.slice(-1)in lo?t+e:t+"+"+e):t}(n)),t instanceof Function?t(e,n):`${e}${n?` (${n})`:""}`):""}}var Id=n(22),Ed=n.n(Id),Nd=n(23),Od=n.n(Nd);class Rd extends Nl{init(){const t=this.editor.t;this._addButton("undo",t("bw"),"CTRL+Z",Ed.a),this._addButton("redo",t("bx"),"CTRL+Y",Od.a);}_addButton(t,e,n,i){const o=this.editor;o.ui.componentFactory.add(t,r=>{const s=o.commands.get(t),a=new Sd(r);return a.set({label:e,icon:i,keystroke:n,tooltip:!0}),a.bind("isEnabled").to(s,"isEnabled"),this.listenTo(a,"execute",()=>o.execute(t)),a});}}class Dd extends Nl{static get requires(){return [Td,Rd]}static get pluginName(){return "Undo"}}function Ld(t){const e=t.next();return e.done?null:e.value}const jd=["left","right","center","justify"];function Vd(t){return jd.includes(t)}function zd(t){return "left"===t}const Bd="alignment";class Fd extends jl{refresh(){const t=Ld(this.editor.model.document.selection.getSelectedBlocks());this.isEnabled=!!t&&this._canBeAligned(t),this.value=this.isEnabled&&t.hasAttribute("alignment")?t.getAttribute("alignment"):"left";}execute(t={}){const e=this.editor.model,n=e.document,i=t.value;e.change(t=>{const e=Array.from(n.selection.getSelectedBlocks()).filter(t=>this._canBeAligned(t)),o=e[0].getAttribute("alignment");zd(i)||o===i||!i?function(t,e){for(const n of t)e.removeAttribute(Bd,n);}(e,t):function(t,e,n){for(const i of t)e.setAttribute(Bd,n,i);}(e,t,i);});}_canBeAligned(t){return this.editor.model.schema.checkAttribute(t,Bd)}}class Ud extends Nl{constructor(t){super(t),t.config.define("alignment",{options:[...jd]});}init(){const t=this.editor,e=t.model.schema,n=t.config.get("alignment.options").filter(Vd);e.extend("$block",{allowAttributes:"alignment"});const i=function(t){const e={model:{key:"alignment",values:t.slice()},view:{}};for(const n of t)e.view[n]={key:"style",value:{"text-align":n}};return e}(n.filter(t=>!zd(t)));t.conversion.attributeToAttribute(i),t.commands.add("alignment",new Fd(t));}}class Hd extends yl{constructor(t){super(t);const e=this.bindTemplate;this.set("isVisible",!1),this.set("position","se"),this.children=this.createCollection(),this.setTemplate({tag:"div",attributes:{class:["ck","ck-reset","ck-dropdown__panel",e.to("position",t=>`ck-dropdown__panel_${t}`),e.if("isVisible","ck-dropdown__panel-visible")]},children:this.children,on:{selectstart:e.to(t=>t.preventDefault())}});}focus(){this.children.length&&this.children.first.focus();}focusLast(){if(this.children.length){const t=this.children.last;"function"==typeof t.focusLast?t.focusLast():t.focus();}}}n(67);function qd({element:t,target:e,positions:n,limiter:i,fitInViewport:o}){ct(e)&&(e=e()),ct(i)&&(i=i());const r=function(t){for(;t&&"html"!=t.tagName.toLowerCase();){if("static"!=Jo.window.getComputedStyle(t).position)return t;t=t.parentElement;}return null}(t.parentElement),s=new ks(t),a=new ks(e);let c,l;if(i||o){const t=i&&new ks(i).getVisible(),e=o&&new ks(Jo.window);[l,c]=function(t,e,n,i,o){let r,s,a=0,c=0;const l=n.getArea();return t.some(t=>{const[d,u]=Wd(t,e,n);let h,f;if(i)if(o){const t=i.getIntersection(o);h=t?t.getIntersectionArea(u):0;}else h=i.getIntersectionArea(u);function m(){c=f,a=h,r=u,s=d;}return o&&(f=o.getIntersectionArea(u)),o&&!i?f>c&&m():!o&&i?h>a&&m():f>c&&h>=a?m():f>=c&&h>a&&m(),h===l}),r?[s,r]:null}(n,a,s,t,e)||Wd(n[0],a,s);}else[l,c]=Wd(n[0],a,s);let{left:d,top:u}=Yd(c);if(r){const t=Yd(new ks(r)),e=ws(r);d-=t.left,u-=t.top,d+=r.scrollLeft,u+=r.scrollTop,d-=e.left,u-=e.top;}return {left:d,top:u,name:l}}function Wd(t,e,n){const{left:i,top:o,name:r}=t(e,n);return [r,n.clone().moveTo(i,o)]}function Yd({left:t,top:e}){const{scrollX:n,scrollY:i}=Jo.window;return {left:t+n,top:e+i}}class $d extends yl{constructor(t,e,n){super(t);const i=this.bindTemplate;this.buttonView=e,this.panelView=n,this.set("isOpen",!1),this.set("isEnabled",!0),this.set("class"),this.set("panelPosition","auto"),this.focusTracker=new Kc,this.keystrokes=new Uc,this.setTemplate({tag:"div",attributes:{class:["ck","ck-dropdown",i.to("class"),i.if("isEnabled","ck-disabled",t=>!t)]},children:[e,n]}),e.extendTemplate({attributes:{class:["ck-dropdown__button"]}});}render(){super.render(),this.listenTo(this.buttonView,"open",()=>{this.isOpen=!this.isOpen;}),this.panelView.bind("isVisible").to(this,"isOpen"),this.on("change:isOpen",()=>{if(this.isOpen)if("auto"===this.panelPosition){const t=$d.defaultPanelPositions;this.panelView.position=qd({element:this.panelView.element,target:this.buttonView.element,fitInViewport:!0,positions:[t.southEast,t.southWest,t.northEast,t.northWest]}).name;}else this.panelView.position=this.panelPosition;}),this.keystrokes.listenTo(this.element),this.focusTracker.add(this.element);const t=(t,e)=>{this.isOpen&&(this.buttonView.focus(),this.isOpen=!1,e());};this.keystrokes.set("arrowdown",(t,e)=>{this.buttonView.isEnabled&&!this.isOpen&&(this.isOpen=!0,e());}),this.keystrokes.set("arrowright",(t,e)=>{this.isOpen&&e();}),this.keystrokes.set("arrowleft",t),this.keystrokes.set("esc",t);}focus(){this.buttonView.focus();}}$d.defaultPanelPositions={southEast:t=>({top:t.bottom,left:t.left,name:"se"}),southWest:(t,e)=>({top:t.bottom,left:t.left-e.width+t.width,name:"sw"}),northEast:(t,e)=>({top:t.top-e.height,left:t.left,name:"ne"}),northWest:(t,e)=>({top:t.bottom-e.height,left:t.left-e.width+t.width,name:"nw"})};var Gd=n(10),Qd=n.n(Gd);class Kd extends Sd{constructor(t){super(t),this.arrowView=this._createArrowView(),this.extendTemplate({attributes:{"aria-haspopup":!0}}),this.delegate("execute").to(this,"open");}render(){super.render(),this.children.add(this.arrowView);}_createArrowView(){const t=new Pd;return t.content=Qd.a,t.extendTemplate({attributes:{class:"ck-dropdown__arrow"}}),t}}n(69);class Jd extends yl{constructor(){super(),this.items=this.createCollection(),this.focusTracker=new Kc,this.keystrokes=new Uc,this._focusCycler=new Tl({focusables:this.items,focusTracker:this.focusTracker,keystrokeHandler:this.keystrokes,actions:{focusPrevious:"arrowup",focusNext:"arrowdown"}}),this.setTemplate({tag:"ul",attributes:{class:["ck","ck-reset","ck-list"]},children:this.items});}render(){super.render();for(const t of this.items)this.focusTracker.add(t.element);this.items.on("add",(t,e)=>{this.focusTracker.add(e.element);}),this.items.on("remove",(t,e)=>{this.focusTracker.remove(e.element);}),this.keystrokes.listenTo(this.element);}focus(){this._focusCycler.focusFirst();}focusLast(){this._focusCycler.focusLast();}}class Zd extends yl{constructor(t){super(t),this.children=this.createCollection(),this.setTemplate({tag:"li",attributes:{class:["ck","ck-list__item"]},children:this.children});}focus(){this.children.first.focus();}}class Xd extends yl{constructor(t){super(t),this.setTemplate({tag:"li",attributes:{class:["ck","ck-list__separator"]}});}}n(71);class tu extends Sd{constructor(t){super(t),this.toggleSwitchView=this._createToggleView(),this.extendTemplate({attributes:{class:"ck-switchbutton"}});}render(){super.render(),this.children.add(this.toggleSwitchView);}_createToggleView(){const t=new yl;return t.setTemplate({tag:"span",attributes:{class:["ck","ck-button__toggle"]},children:[{tag:"span",attributes:{class:["ck","ck-button__toggle__inner"]}}]}),t}}function eu({emitter:t,activator:e,callback:n,contextElements:i}){t.listenTo(document,"mousedown",(t,{target:o})=>{if(e()){for(const t of i)if(t.contains(o))return;n();}});}n(73),n(75);function nu(t,e=Kd){const n=new e(t),i=new Hd(t),o=new $d(t,n,i);return n.bind("isEnabled").to(o),n instanceof Kd?n.bind("isOn").to(o,"isOpen"):n.arrowView.bind("isOn").to(o,"isOpen"),function(t){(function(t){t.on("render",()=>{eu({emitter:t,activator:()=>t.isOpen,callback:()=>{t.isOpen=!1;},contextElements:[t.element]});});})(t),function(t){t.on("execute",e=>{e.source instanceof tu||(t.isOpen=!1);});}(t),function(t){t.keystrokes.set("arrowdown",(e,n)=>{t.isOpen&&(t.panelView.focus(),n());}),t.keystrokes.set("arrowup",(e,n)=>{t.isOpen&&(t.panelView.focusLast(),n());});}(t);}(o),o}function iu(t,e){const n=t.toolbarView=new Sl;t.extendTemplate({attributes:{class:["ck-toolbar-dropdown"]}}),e.map(t=>n.items.add(t)),t.panelView.children.add(n),n.items.delegate("execute").to(t);}function ou(t,e){const n=t.locale,i=t.listView=new Jd(n);i.items.bindTo(e).using(({type:t,model:e})=>{if("separator"===t)return new Xd(n);if("button"===t||"switchbutton"===t){const i=new Zd(n);let o;return (o="button"===t?new Sd(n):new tu(n)).bind(...Object.keys(e)).to(e),o.delegate("execute").to(i),i.children.add(o),i}}),t.panelView.children.add(i),i.items.delegate("execute").to(t);}var ru=n(14),su=n.n(ru),au=n(24),cu=n.n(au),lu=n(25),du=n.n(lu),uu=n(26),hu=n.n(uu);const fu=new Map([["left",su.a],["right",cu.a],["center",du.a],["justify",hu.a]]);class mu extends Nl{get localizedOptionTitles(){const t=this.editor.t;return {left:t("h"),right:t("i"),center:t("j"),justify:t("k")}}static get pluginName(){return "AlignmentUI"}init(){const t=this.editor,e=t.ui.componentFactory,n=t.t,i=t.config.get("alignment.options");i.filter(Vd).forEach(t=>this._addButton(t)),e.add("alignment",t=>{const o=nu(t),r=i.map(t=>e.create(`alignment:${t}`));iu(o,r),o.buttonView.set({label:n("l"),tooltip:!0}),o.toolbarView.isVertical=!0,o.extendTemplate({attributes:{class:"ck-alignment-dropdown"}});const s=su.a;return o.buttonView.bind("icon").toMany(r,"isOn",(...t)=>{const e=t.findIndex(t=>t);return e<0?s:r[e].icon}),o.bind("isEnabled").toMany(r,"isEnabled",(...t)=>t.some(t=>t)),o});}_addButton(t){const e=this.editor;e.ui.componentFactory.add(`alignment:${t}`,n=>{const i=e.commands.get("alignment"),o=new Sd(n);return o.set({label:this.localizedOptionTitles[t],icon:fu.get(t),tooltip:!0}),o.bind("isEnabled").to(i),o.bind("isOn").to(i,"value",e=>e===t),this.listenTo(o,"execute",()=>{e.execute("alignment",{value:t}),e.editing.view.focus();}),o});}}class gu extends jl{constructor(t,e){super(t),this.attributeKey=e;}refresh(){const t=this.editor.model,e=t.document;this.value=e.selection.getAttribute(this.attributeKey),this.isEnabled=t.schema.checkAttributeInSelection(e.selection,this.attributeKey);}execute(t={}){const e=this.editor.model,n=e.document.selection,i=t.value;e.change(t=>{if(n.isCollapsed)i?t.setSelectionAttribute(this.attributeKey,i):t.removeSelectionAttribute(this.attributeKey);else{const o=e.schema.getValidRanges(n.getRanges(),this.attributeKey);for(const e of o)i?t.setAttribute(this.attributeKey,i,e):t.removeAttribute(this.attributeKey,e);}});}}class pu extends gu{constructor(t){super(t,"fontSize");}}function bu(t){return t.map(_u).filter(t=>!!t)}const wu={tiny:{title:"Tiny",model:"tiny",view:{name:"span",classes:"text-tiny",priority:5}},small:{title:"Small",model:"small",view:{name:"span",classes:"text-small",priority:5}},big:{title:"Big",model:"big",view:{name:"span",classes:"text-big",priority:5}},huge:{title:"Huge",model:"huge",view:{name:"span",classes:"text-huge",priority:5}}};function _u(t){if("object"==typeof t)return t;if(wu[t])return wu[t];if("default"===t)return {model:void 0,title:"Default"};const e=parseFloat(t);return isNaN(e)?void 0:function(t){return {title:String(t),model:t,view:{name:"span",styles:{"font-size":`${t}px`},priority:5}}}(e)}function ku(t,e){const n={model:{key:t,values:[]},view:{},upcastAlso:{}};for(const t of e)n.model.values.push(t.model),n.view[t.model]=t.view,t.upcastAlso&&(n.upcastAlso[t.model]=t.upcastAlso);return n}const vu="fontSize";class yu extends Nl{constructor(t){super(t),t.config.define(vu,{options:["tiny","small","default","big","huge"]});const e=bu(this.editor.config.get("fontSize.options")).filter(t=>t.model),n=ku(vu,e);t.conversion.attributeToElement(n),t.commands.add(vu,new pu(t));}init(){this.editor.model.schema.extend("$text",{allowAttributes:vu});}}class xu{constructor(t,e){e&&Ei(this,e),t&&this.set(t);}}F(xu,Li);var Au=n(27),Cu=n.n(Au);n(77);class Tu extends Nl{init(){const t=this.editor,e=t.t,n=this._getLocalizedOptions(),i=t.commands.get("fontSize");t.ui.componentFactory.add("fontSize",o=>{const r=nu(o);return ou(r,function(t,e){const n=new Xi;for(const i of t){const t={type:"button",model:new xu({commandName:"fontSize",commandParam:i.model,label:i.title,class:"ck-fontsize-option",withText:!0})};i.view&&i.view.styles&&t.model.set("labelStyle",`font-size:${i.view.styles["font-size"]}`),i.view&&i.view.classes&&t.model.set("class",`${t.model.class} ${i.view.classes}`),t.model.bind("isOn").to(e,"value",t=>t===i.model),n.add(t);}return n}(n,i)),r.buttonView.set({label:e("b"),icon:Cu.a,tooltip:!0}),r.extendTemplate({attributes:{class:["ck-font-size-dropdown"]}}),r.bind("isEnabled").to(i),this.listenTo(r,"execute",e=>{t.execute(e.source.commandName,{value:e.source.commandParam}),t.editing.view.focus();}),r});}_getLocalizedOptions(){const t=this.editor,e=t.t,n={Default:e("c"),Tiny:e("d"),Small:e("e"),Big:e("f"),Huge:e("g")};return bu(t.config.get("fontSize.options")).map(t=>{const e=n[t.title];return e&&e!=t.title&&(t=Object.assign({},t,{title:e})),t})}}class Pu extends gu{constructor(t){super(t,"fontFamily");}}function Mu(t){return t.map(Su).filter(t=>!!t)}function Su(t){return "object"==typeof t?t:"default"===t?{title:"Default",model:void 0}:"string"==typeof t?function(t){const e=t.replace(/"|'/g,"").split(","),n=e[0],i=e.map(Iu).join(", ");return {title:n,model:n,view:{name:"span",styles:{"font-family":i},priority:5}}}(t):void 0}function Iu(t){return (t=t.trim()).indexOf(" ")>0&&(t=`'${t}'`),t}const Eu="fontFamily";class Nu extends Nl{constructor(t){super(t),t.config.define(Eu,{options:["default","Arial, Helvetica, sans-serif","Courier New, Courier, monospace","Georgia, serif","Lucida Sans Unicode, Lucida Grande, sans-serif","Tahoma, Geneva, sans-serif","Times New Roman, Times, serif","Trebuchet MS, Helvetica, sans-serif","Verdana, Geneva, sans-serif"]});}init(){const t=this.editor;t.model.schema.extend("$text",{allowAttributes:Eu});const e=Mu(t.config.get("fontFamily.options")).filter(t=>t.model),n=ku(Eu,e);t.conversion.attributeToElement(n),t.commands.add(Eu,new Pu(t));}}var Ou=n(28),Ru=n.n(Ou);class Du extends Nl{init(){const t=this.editor,e=t.t,n=this._getLocalizedOptions(),i=t.commands.get("fontFamily");t.ui.componentFactory.add("fontFamily",o=>{const r=nu(o);return ou(r,function(t,e){const n=new Xi;for(const i of t){const t={type:"button",model:new xu({commandName:"fontFamily",commandParam:i.model,label:i.title,withText:!0})};t.model.bind("isOn").to(e,"value",t=>t===i.model),i.view&&i.view.styles&&t.model.set("labelStyle",`font-family: ${i.view.styles["font-family"]}`),n.add(t);}return n}(n,i)),r.buttonView.set({label:e("m"),icon:Ru.a,tooltip:!0}),r.extendTemplate({attributes:{class:"ck-font-family-dropdown"}}),r.bind("isEnabled").to(i),this.listenTo(r,"execute",e=>{t.execute(e.source.commandName,{value:e.source.commandParam}),t.editing.view.focus();}),r});}_getLocalizedOptions(){const t=this.editor,e=t.t;return Mu(t.config.get("fontFamily.options")).map(t=>("Default"===t.title&&(t.title=e("c")),t))}}class Lu extends jl{refresh(){const t=this.editor.model,e=t.document;this.value=e.selection.getAttribute("highlight"),this.isEnabled=t.schema.checkAttributeInSelection(e.selection,"highlight");}execute(t={}){const e=this.editor.model,n=e.document.selection,i=t.value;e.change(t=>{const o=e.schema.getValidRanges(n.getRanges(),"highlight");if(n.isCollapsed){const e=n.getFirstPosition();if(n.hasAttribute("highlight")){const n=t=>t.item.hasAttribute("highlight")&&t.item.getAttribute("highlight")===this.value,o=e.getLastMatchingPosition(n,{direction:"backward"}),r=e.getLastMatchingPosition(n),s=t.createRange(o,r);i&&this.value!==i?(t.setAttribute("highlight",i,s),t.setSelectionAttribute("highlight",i)):(t.removeAttribute("highlight",s),t.removeSelectionAttribute("highlight"));}else i&&t.setSelectionAttribute("highlight",i);}else for(const e of o)i?t.setAttribute("highlight",i,e):t.removeAttribute("highlight",e);});}}class ju extends Nl{constructor(t){super(t),t.config.define("highlight",{options:[{model:"yellowMarker",class:"marker-yellow",title:"Yellow marker",color:"var(--ck-highlight-marker-yellow)",type:"marker"},{model:"greenMarker",class:"marker-green",title:"Green marker",color:"var(--ck-highlight-marker-green)",type:"marker"},{model:"pinkMarker",class:"marker-pink",title:"Pink marker",color:"var(--ck-highlight-marker-pink)",type:"marker"},{model:"blueMarker",class:"marker-blue",title:"Blue marker",color:"var(--ck-highlight-marker-blue)",type:"marker"},{model:"redPen",class:"pen-red",title:"Red pen",color:"var(--ck-highlight-pen-red)",type:"pen"},{model:"greenPen",class:"pen-green",title:"Green pen",color:"var(--ck-highlight-pen-green)",type:"pen"}]});}init(){const t=this.editor;t.model.schema.extend("$text",{allowAttributes:"highlight"});const e=t.config.get("highlight.options");t.conversion.attributeToElement(function(t){const e={model:{key:"highlight",values:[]},view:{}};for(const n of t)e.model.values.push(n.model),e.view[n.model]={name:"mark",classes:n.class};return e}(e)),t.commands.add("highlight",new Lu(t));}}var Vu=n(29),zu=n.n(Vu),Bu=n(30),Fu=n.n(Bu),Uu=n(31),Hu=n.n(Uu);n(79);class qu extends yl{constructor(t){super(t);const e=this.bindTemplate;this.set("icon"),this.set("isEnabled",!0),this.set("isOn",!1),this.set("isVisible",!0),this.set("keystroke"),this.set("label"),this.set("tabindex",-1),this.set("tooltip"),this.set("tooltipPosition","s"),this.set("type","button"),this.set("withText",!1),this.children=this.createCollection(),this.actionView=this._createActionView(),this.arrowView=this._createArrowView(),this.keystrokes=new Uc,this.focusTracker=new Kc,this.setTemplate({tag:"div",attributes:{class:["ck","ck-splitbutton",e.if("isVisible","ck-hidden",t=>!t),this.arrowView.bindTemplate.if("isOn","ck-splitbutton_open")]},children:this.children});}render(){super.render(),this.children.add(this.actionView),this.children.add(this.arrowView),this.focusTracker.add(this.actionView.element),this.focusTracker.add(this.arrowView.element),this.keystrokes.listenTo(this.element),this.keystrokes.set("arrowright",(t,e)=>{this.focusTracker.focusedElement===this.actionView.element&&(this.arrowView.focus(),e());}),this.keystrokes.set("arrowleft",(t,e)=>{this.focusTracker.focusedElement===this.arrowView.element&&(this.actionView.focus(),e());});}focus(){this.actionView.focus();}_createActionView(){const t=new Sd;return t.bind("icon","isEnabled","isOn","keystroke","label","tabindex","tooltip","tooltipPosition","type","withText").to(this),t.extendTemplate({attributes:{class:"ck-splitbutton__action"}}),t.delegate("execute").to(this),t}_createArrowView(){const t=new Sd;return t.icon=Qd.a,t.extendTemplate({attributes:{class:"ck-splitbutton__arrow","aria-haspopup":!0}}),t.bind("isEnabled").to(this),t.delegate("execute").to(this,"open"),t}}n(81);class Wu extends Nl{get localizedOptionTitles(){const t=this.editor.t;return {"Yellow marker":t("n"),"Green marker":t("o"),"Pink marker":t("p"),"Blue marker":t("q"),"Red pen":t("r"),"Green pen":t("s")}}static get pluginName(){return "HighlightUI"}init(){const t=this.editor.config.get("highlight.options");for(const e of t)this._addHighlighterButton(e);this._addRemoveHighlightButton(),this._addDropdown(t);}_addRemoveHighlightButton(){const t=this.editor.t;this._addButton("removeHighlight",t("t"),Hu.a);}_addHighlighterButton(t){const e=this.editor.commands.get("highlight");this._addButton("highlight:"+t.model,t.title,Yu(t.type),t.model,function(n){n.bind("isEnabled").to(e,"isEnabled"),n.bind("isOn").to(e,"value",e=>e===t.model),n.iconView.fillColor=t.color;});}_addButton(t,e,n,i,o=(()=>{})){const r=this.editor;r.ui.componentFactory.add(t,t=>{const s=new Sd(t),a=this.localizedOptionTitles[e]?this.localizedOptionTitles[e]:e;return s.set({label:a,icon:n,tooltip:!0}),s.on("execute",()=>{r.execute("highlight",{value:i}),r.editing.view.focus();}),o(s),s});}_addDropdown(t){const e=this.editor,n=e.t,i=e.ui.componentFactory,o=t[0],r=t.reduce((t,e)=>(t[e.model]=e,t),{});i.add("highlight",s=>{const a=e.commands.get("highlight"),c=nu(s,qu),l=c.buttonView;l.set({tooltip:n("u"),lastExecuted:o.model,commandValue:o.model}),l.bind("icon").to(a,"value",t=>Yu(u(t,"type"))),l.bind("color").to(a,"value",t=>u(t,"color")),l.bind("commandValue").to(a,"value",t=>u(t,"model")),l.bind("isOn").to(a,"value",t=>!!t),l.delegate("execute").to(c);const d=t.map(t=>{const e=i.create("highlight:"+t.model);return this.listenTo(e,"execute",()=>c.buttonView.set({lastExecuted:t.model})),e});function u(t,e){const n=t&&t!==l.lastExecuted?t:l.lastExecuted;return r[n][e]}return c.bind("isEnabled").toMany(d,"isEnabled",(...t)=>t.some(t=>t)),d.push(new Ml),d.push(i.create("removeHighlight")),iu(c,d),function(t){t.buttonView.actionView.iconView.bind("fillColor").to(t.buttonView,"color");}(c),l.on("execute",()=>{e.execute("highlight",{value:l.commandValue}),e.editing.view.focus();}),c});}}function Yu(t){return "marker"===t?zu.a:Fu.a}class $u extends Nl{static get pluginName(){return "PendingActions"}init(){this.set("hasAny",!1),this._actions=new Xi({idProperty:"_id"}),this._actions.delegate("add","remove").to(this);}add(t){if("string"!=typeof t)throw new P.b("pendingactions-add-invalid-message: The message must be a string.");const e=Object.create(Li);return e.set("message",t),this._actions.add(e),this.hasAny=!0,e}remove(t){this._actions.remove(t),this.hasAny=!!this._actions.length;}get first(){return this._actions.get(0)}[Symbol.iterator](){return this._actions[Symbol.iterator]()}}class Gu{constructor(){const t=new window.FileReader;this._reader=t,this.set("loaded",0),t.onprogress=(t=>{this.loaded=t.loaded;});}get error(){return this._reader.error}read(t){const e=this._reader;return this.total=t.size,new Promise((n,i)=>{e.onload=(()=>{n(e.result);}),e.onerror=(()=>{i("error");}),e.onabort=(()=>{i("aborted");}),this._reader.readAsDataURL(t);})}abort(){this._reader.abort();}}F(Gu,Li);class Qu extends Nl{static get pluginName(){return "FileRepository"}static get requires(){return [$u]}init(){this.loaders=new Xi,this.loaders.on("add",()=>this._updatePendingAction()),this.loaders.on("remove",()=>this._updatePendingAction()),this._pendingAction=null,this.set("uploaded",0),this.set("uploadTotal",null),this.bind("uploadedPercent").to(this,"uploaded",this,"uploadTotal",(t,e)=>e?t/e*100:0);}getLoader(t){for(const e of this.loaders)if(e.file==t)return e;return null}createLoader(t){if(!this.createUploadAdapter)return fs.a.error("filerepository-no-upload-adapter: Upload adapter is not defined."),null;const e=new Ku(t);return e._adapter=this.createUploadAdapter(e),this.loaders.add(e),e.on("change:uploaded",()=>{let t=0;for(const e of this.loaders)t+=e.uploaded;this.uploaded=t;}),e.on("change:uploadTotal",()=>{let t=0;for(const e of this.loaders)e.uploadTotal&&(t+=e.uploadTotal);this.uploadTotal=t;}),e}destroyLoader(t){const e=t instanceof Ku?t:this.getLoader(t);e._destroy(),this.loaders.remove(e);}_updatePendingAction(){const t=this.editor.plugins.get($u);if(this.loaders.length){if(!this._pendingAction){const e=this.editor.t,n=t=>`${e("bm")} ${parseInt(t)}%.`;this._pendingAction=t.add(n(this.uploadedPercent)),this._pendingAction.bind("message").to(this,"uploadedPercent",n);}}else t.remove(this._pendingAction),this._pendingAction=null;}}F(Qu,Li);class Ku{constructor(t,e){this.id=I(),this.file=t,this._adapter=e,this._reader=new Gu,this.set("status","idle"),this.set("uploaded",0),this.set("uploadTotal",null),this.bind("uploadedPercent").to(this,"uploaded",this,"uploadTotal",(t,e)=>e?t/e*100:0),this.set("uploadResponse",null);}read(){if("idle"!=this.status)throw new P.b("filerepository-read-wrong-status: You cannot call read if the status is different than idle.");return this.status="reading",this._reader.read(this.file).then(t=>(this.status="idle",t)).catch(t=>{if("aborted"===t)throw this.status="aborted","aborted";throw this.status="error",this._reader.error})}upload(){if("idle"!=this.status)throw new P.b("filerepository-upload-wrong-status: You cannot call upload if the status is different than idle.");return this.status="uploading",this._adapter.upload().then(t=>(this.uploadResponse=t,this.status="idle",t)).catch(t=>{if("aborted"===this.status)throw"aborted";throw this.status="error",t})}abort(){const t=this.status;this.status="aborted","reading"==t&&this._reader.abort(),"uploading"==t&&this._adapter.abort&&this._adapter.abort(),this._destroy();}_destroy(){this._reader=void 0,this._adapter=void 0,this.data=void 0,this.uploadResponse=void 0,this.file=void 0;}}F(Ku,Li);const Ju="ckCsrfToken",Zu=40,Xu="abcdefghijklmnopqrstuvwxyz0123456789";function th(){let t=function(t){t=t.toLowerCase();const e=document.cookie.split(";");for(const n of e){const e=n.split("="),i=decodeURIComponent(e[0].trim().toLowerCase());if(i===t)return decodeURIComponent(e[1])}return null}(Ju);return t&&t.length==Zu||(t=function(t){let e="";const n=new Uint8Array(t);window.crypto.getRandomValues(n);for(let t=0;t<n.length;t++){const i=Xu.charAt(n[t]%Xu.length);e+=Math.random()>.5?i.toUpperCase():i;}return e}(Zu),function(t,e){document.cookie=encodeURIComponent(t)+"="+encodeURIComponent(e)+";path=/";}(Ju,t)),t}class eh extends Nl{static get requires(){return [Qu]}static get pluginName(){return "CKFinderUploadAdapter"}init(){const t=this.editor.config.get("ckfinder.uploadUrl");t&&(this.editor.plugins.get(Qu).createUploadAdapter=(e=>new nh(e,t,this.editor.t)));}}class nh{constructor(t,e,n){this.loader=t,this.url=e,this.t=n;}upload(){return new Promise((t,e)=>{this._initRequest(),this._initListeners(t,e),this._sendRequest();})}abort(){this.xhr&&this.xhr.abort();}_initRequest(){const t=this.xhr=new XMLHttpRequest;t.open("POST",this.url,!0),t.responseType="json";}_initListeners(t,e){const n=this.xhr,i=this.loader,o=(0, this.t)("a")+` ${i.file.name}.`;n.addEventListener("error",()=>e(o)),n.addEventListener("abort",()=>e()),n.addEventListener("load",()=>{const i=n.response;if(!i||!i.uploaded)return e(i&&i.error&&i.error.message?i.error.message:o);t({default:i.url});}),n.upload&&n.upload.addEventListener("progress",t=>{t.lengthComputable&&(i.uploadTotal=t.total,i.uploaded=t.loaded);});}_sendRequest(){const t=new FormData;t.append("upload",this.loader.file),t.append("ckCsrfToken",th()),this.xhr.send(t);}}class ih{constructor(t,e,n){let i;if("function"==typeof n)i=n;else{const e=n;i=(()=>{t.execute(e);});}t.model.document.on("change",(n,o)=>{if("transparent"==o.type)return;const r=Array.from(t.model.document.differ.getChanges()),s=r[0];if(1!=r.length||"insert"!==s.type||"$text"!=s.name||1!=s.length)return;const a=s.position.textNode||s.position.nodeAfter;if(!a.parent.is("paragraph"))return;const c=e.exec(a.data);c&&t.model.enqueueChange(t=>{const e=t.createPositionAt(a.parent,0),n=t.createPositionAt(a.parent,c[0].length),o=t.createRange(e,n);t.remove(o),i({match:c});});});}}class oh{constructor(t,e,n){let i,o,r,s;e instanceof RegExp?i=e:r=e,"string"==typeof n?o=n:s=n,r=r||(t=>{let e;const n=[],o=[];for(;null!==(e=i.exec(t))&&!(e&&e.length<4);){let{index:t,1:i,2:r,3:s}=e;const a=i+r+s,c=[t+=e[0].length-a.length,t+i.length],l=[t+i.length+r.length,t+i.length+r.length+s.length];n.push(c),n.push(l),o.push([t+i.length,t+i.length+r.length]);}return {remove:n,format:o}}),s=s||((t,e)=>{for(const n of e)t.setAttribute(o,!0,n);t.removeSelectionAttribute(o);}),t.model.document.on("change",(e,n)=>{if("transparent"==n.type)return;const i=t.model.document.selection;if(!i.isCollapsed)return;const a=Array.from(t.model.document.differ.getChanges()),c=a[0];if(1!=a.length||"insert"!==c.type||"$text"!=c.name||1!=c.length)return;const l=i.focus.parent,d=function(t){return Array.from(t.getChildren()).reduce((t,e)=>t+e.data,"")}(l).slice(0,i.focus.offset),u=r(d),h=rh(l,u.format,t.model),f=rh(l,u.remove,t.model);h.length&&f.length&&t.model.enqueueChange(e=>{const n=t.model.schema.getValidRanges(h,o);s(e,n);for(const t of f.reverse())e.remove(t);});});}}function rh(t,e,n){return e.filter(t=>void 0!==t[0]&&void 0!==t[1]).map(e=>n.createRange(n.createPositionAt(t,e[0]),n.createPositionAt(t,e[1])))}class sh extends jl{constructor(t,e){super(t),this.attributeKey=e;}refresh(){const t=this.editor.model,e=t.document;this.value=this._getValueFromFirstAllowedNode(),this.isEnabled=t.schema.checkAttributeInSelection(e.selection,this.attributeKey);}execute(t={}){const e=this.editor.model,n=e.document.selection,i=void 0===t.forceValue?!this.value:t.forceValue;e.change(t=>{if(n.isCollapsed)i?t.setSelectionAttribute(this.attributeKey,!0):t.removeSelectionAttribute(this.attributeKey);else{const o=e.schema.getValidRanges(n.getRanges(),this.attributeKey);for(const e of o)i?t.setAttribute(this.attributeKey,i,e):t.removeAttribute(this.attributeKey,e);}});}_getValueFromFirstAllowedNode(){const t=this.editor.model,e=t.schema,n=t.document.selection;if(n.isCollapsed)return n.hasAttribute(this.attributeKey);for(const t of n.getRanges())for(const n of t.getItems())if(e.checkAttribute(n,this.attributeKey))return n.hasAttribute(this.attributeKey);return !1}}const ah="bold";class ch extends Nl{init(){const t=this.editor;t.model.schema.extend("$text",{allowAttributes:ah}),t.conversion.attributeToElement({model:ah,view:"strong",upcastAlso:["b",{styles:{"font-weight":"bold"}}]}),t.commands.add(ah,new sh(t,ah)),t.keystrokes.set("CTRL+B",ah);}}var lh=n(32),dh=n.n(lh);const uh="bold";class hh extends Nl{init(){const t=this.editor,e=t.t;t.ui.componentFactory.add(uh,n=>{const i=t.commands.get(uh),o=new Sd(n);return o.set({label:e("v"),icon:dh.a,keystroke:"CTRL+B",tooltip:!0}),o.bind("isOn","isEnabled").to(i,"value","isEnabled"),this.listenTo(o,"execute",()=>t.execute(uh)),o});}}const fh="italic";class mh extends Nl{init(){const t=this.editor;t.model.schema.extend("$text",{allowAttributes:fh}),t.conversion.attributeToElement({model:fh,view:"i",upcastAlso:["em",{styles:{"font-style":"italic"}}]}),t.commands.add(fh,new sh(t,fh)),t.keystrokes.set("CTRL+I",fh);}}var gh=n(33),ph=n.n(gh);const bh="italic";class wh extends Nl{init(){const t=this.editor,e=t.t;t.ui.componentFactory.add(bh,n=>{const i=t.commands.get(bh),o=new Sd(n);return o.set({label:e("z"),icon:ph.a,keystroke:"CTRL+I",tooltip:!0}),o.bind("isOn","isEnabled").to(i,"value","isEnabled"),this.listenTo(o,"execute",()=>t.execute(bh)),o});}}const _h="strikethrough";class kh extends Nl{init(){const t=this.editor;t.model.schema.extend("$text",{allowAttributes:_h}),t.conversion.attributeToElement({model:_h,view:"s",upcastAlso:["del","strike",{styles:{"text-decoration":"line-through"}}]}),t.commands.add(_h,new sh(t,_h)),t.keystrokes.set("CTRL+SHIFT+X","strikethrough");}}var vh=n(34),yh=n.n(vh);const xh="strikethrough";class Ah extends Nl{init(){const t=this.editor,e=t.t;t.ui.componentFactory.add(xh,n=>{const i=t.commands.get(xh),o=new Sd(n);return o.set({label:e("w"),icon:yh.a,keystroke:"CTRL+SHIFT+X",tooltip:!0}),o.bind("isOn","isEnabled").to(i,"value","isEnabled"),this.listenTo(o,"execute",()=>t.execute(xh)),o});}}const Ch="underline";class Th extends Nl{init(){const t=this.editor;t.model.schema.extend("$text",{allowAttributes:Ch}),t.conversion.attributeToElement({model:Ch,view:"u",upcastAlso:{styles:{"text-decoration":"underline"}}}),t.commands.add(Ch,new sh(t,Ch)),t.keystrokes.set("CTRL+U","underline");}}var Ph=n(35),Mh=n.n(Ph);const Sh="underline";class Ih extends Nl{init(){const t=this.editor,e=t.t;t.ui.componentFactory.add(Sh,n=>{const i=t.commands.get(Sh),o=new Sd(n);return o.set({label:e("y"),icon:Mh.a,keystroke:"CTRL+U",tooltip:!0}),o.bind("isOn","isEnabled").to(i,"value","isEnabled"),this.listenTo(o,"execute",()=>t.execute(Sh)),o});}}class Eh extends jl{refresh(){this.value=this._getValue(),this.isEnabled=this._checkEnabled();}execute(){const t=this.editor.model,e=t.document,n=t.schema,i=Array.from(e.selection.getSelectedBlocks());t.change(t=>{if(this.value)this._removeQuote(t,i.filter(Nh));else{const e=i.filter(t=>Nh(t)||Rh(n,t));this._applyQuote(t,e);}});}_getValue(){const t=Ld(this.editor.model.document.selection.getSelectedBlocks());return !(!t||!Nh(t))}_checkEnabled(){if(this.value)return !0;const t=this.editor.model.document.selection,e=this.editor.model.schema,n=Ld(t.getSelectedBlocks());return !!n&&Rh(e,n)}_removeQuote(t,e){Oh(t,e).reverse().forEach(e=>{if(e.start.isAtStart&&e.end.isAtEnd)return void t.unwrap(e.start.parent);if(e.start.isAtStart){const n=t.createPositionBefore(e.start.parent);return void t.move(e,n)}e.end.isAtEnd||t.split(e.end);const n=t.createPositionAfter(e.end.parent);t.move(e,n);});}_applyQuote(t,e){const n=[];Oh(t,e).reverse().forEach(e=>{let i=Nh(e.start);i||(i=t.createElement("blockQuote"),t.wrap(e,i)),n.push(i);}),n.reverse().reduce((e,n)=>e.nextSibling==n?(t.merge(t.createPositionAfter(e)),e):n);}}function Nh(t){return "blockQuote"==t.parent.name?t.parent:null}function Oh(t,e){let n,i=0;const o=[];for(;i<e.length;){const r=e[i],s=e[i+1];n||(n=t.createPositionBefore(r)),s&&r.nextSibling==s||(o.push(t.createRange(n,t.createPositionAfter(r))),n=null),i++;}return o}function Rh(t,e){const n=t.checkChild(e.parent,"blockQuote"),i=t.checkChild(["$root","blockQuote"],e);return n&&i}class Dh extends Nl{init(){const t=this.editor,e=t.model.schema;t.commands.add("blockQuote",new Eh(t)),e.register("blockQuote",{allowWhere:"$block",allowContentOf:"$root"}),e.addChildCheck((t,e)=>{if(t.endsWith("blockQuote")&&"blockQuote"==e.name)return !1}),t.conversion.elementToElement({model:"blockQuote",view:"blockquote"}),t.model.document.registerPostFixer(n=>{const i=t.model.document.differ.getChanges();for(const t of i)if("insert"==t.type){const i=t.position.nodeAfter;if(!i)continue;if(i.is("blockQuote")&&i.isEmpty)return n.remove(i),!0;if(i.is("blockQuote")&&!e.checkChild(t.position,i))return n.unwrap(i),!0;if(i.is("element")){const t=n.createRangeIn(i);for(const i of t.getItems())if(i.is("blockQuote")&&!e.checkChild(n.createPositionBefore(i),i))return n.unwrap(i),!0}}else if("remove"==t.type){const e=t.position.parent;if(e.is("blockQuote")&&e.isEmpty)return n.remove(e),!0}return !1});}afterInit(){const t=this.editor.commands.get("blockQuote");this.listenTo(this.editor.editing.view.document,"enter",(e,n)=>{const i=this.editor.model.document,o=i.selection.getLastPosition().parent;i.selection.isCollapsed&&o.isEmpty&&t.value&&(this.editor.execute("blockQuote"),this.editor.editing.view.scrollToTheSelection(),n.preventDefault(),e.stop());});}}var Lh=n(36),jh=n.n(Lh);n(83);class Vh extends Nl{init(){const t=this.editor,e=t.t;t.ui.componentFactory.add("blockQuote",n=>{const i=t.commands.get("blockQuote"),o=new Sd(n);return o.set({label:e("x"),icon:jh.a,tooltip:!0}),o.bind("isOn","isEnabled").to(i,"value","isEnabled"),this.listenTo(o,"execute",()=>t.execute("blockQuote")),o});}}var zh=n(37),Bh=n.n(zh);class Fh extends Nl{static get pluginName(){return "CKFinderUI"}init(){const t=this.editor,e=t.ui.componentFactory,n=t.t;e.add("ckfinder",e=>{const i=t.commands.get("ckfinder"),o=new Sd(e);return o.set({label:n("ab"),icon:Bh.a,tooltip:!0}),o.bind("isEnabled").to(i),o.on("execute",()=>{t.execute("ckfinder"),t.editing.view.focus();}),o});}}class Uh extends Nl{static get pluginName(){return "Notification"}init(){this.on("show:warning",(t,e)=>{window.alert(e.message);},{priority:"lowest"});}showSuccess(t,e={}){this._showNotification({message:t,type:"success",namespace:e.namespace,title:e.title});}showInfo(t,e={}){this._showNotification({message:t,type:"info",namespace:e.namespace,title:e.title});}showWarning(t,e={}){this._showNotification({message:t,type:"warning",namespace:e.namespace,title:e.title});}_showNotification(t){const e=`show:${t.type}`+(t.namespace?`:${t.namespace}`:"");this.fire(e,{message:t.message,type:t.type,title:t.title||""});}}class Hh extends jl{constructor(t){super(t),this.stopListening(this.editor.model.document,"change"),this.listenTo(this.editor.model.document,"change",()=>this.refresh(),{priority:"low"});}refresh(){const t=this.editor.commands.get("imageUpload"),e=this.editor.commands.get("link");this.isEnabled=t&&e&&(t.isEnabled||e.isEnabled);}execute(){const t=this.editor,e=this.editor.config.get("ckfinder.openerMethod")||"modal";if("popup"!=e&&"modal"!=e)throw new P.b('ckfinder-unknown-openerMethod: The openerMethod config option must by "popup" or "modal".');const n=Object.assign({},this.editor.config.get("ckfinder.options"));n.chooseFiles=!0;const i=n.onInit;n.language||(n.language=t.locale.language),n.onInit=(e=>{i&&i(),e.on("files:choose",n=>{const i=n.data.files.toArray(),o=i.filter(t=>!t.isImage()),r=i.filter(t=>t.isImage());for(const e of o)t.execute("link",e.getUrl());const s=[];for(const t of r){const n=t.getUrl();s.push(n||e.request("file:getProxyUrl",{file:t}));}s.length&&qh(t,s);}),e.on("file:choose:resizedImage",e=>{const n=e.data.resizedUrl;if(n)qh(t,[n]);else{const e=t.plugins.get(Uh),n=t.locale.t;e.showWarning(n("bn"),{title:n("bo"),namespace:"ckfinder"});}});}),window.CKFinder[e](n);}}function qh(t,e){if(t.commands.get("imageUpload").isEnabled)t.execute("imageInsert",{source:e});else{const e=t.plugins.get(Uh),n=t.locale.t;e.showWarning(n("bp"),{title:n("bq"),namespace:"ckfinder"});}}class Wh extends Nl{static get pluginName(){return "CKFinderEditing"}static get requires(){return [Uh]}init(){const t=this.editor;t.commands.add("ckfinder",new Hh(t));}}const Yh=/^data:(\S*?);base64,/;class $h{constructor(t,e,n){if(!t)throw new Error("File must be provided");if(!e)throw new Error("Token must be provided");if(!n)throw new Error("Api address must be provided");this.file=function(t){if("string"!=typeof t)return !1;const e=t.match(Yh);return !(!e||!e.length)}(t)?function(t,e=512){try{const n=t.match(Yh)[1],i=atob(t.replace(Yh,"")),o=[];for(let t=0;t<i.length;t+=e){const n=i.slice(t,t+e),r=new Array(n.length);for(let t=0;t<n.length;t++)r[t]=n.charCodeAt(t);o.push(new Uint8Array(r));}return new Blob(o,{type:n})}catch(t){throw new Error("Problem with decoding Base64 image data.")}}(t):t,this._token=e,this._apiAddress=n;}onProgress(t){return this.on("progress",(e,n)=>t(n)),this}onError(t){return this.once("error",(e,n)=>t(n)),this}abort(){this.xhr.abort();}send(){return this._prepareRequest(),this._attachXHRListeners(),this._sendRequest()}_prepareRequest(){const t=new XMLHttpRequest;t.open("POST",this._apiAddress),t.setRequestHeader("Authorization",this._token.value),t.responseType="json",this.xhr=t;}_attachXHRListeners(){const t=this,e=this.xhr;function n(e){return ()=>t.fire("error",e)}e.addEventListener("error",n("Network Error")),e.addEventListener("abort",n("Abort")),e.upload&&e.upload.addEventListener("progress",t=>{t.lengthComputable&&this.fire("progress",{total:t.total,uploaded:t.loaded});}),e.addEventListener("load",()=>{const t=e.status,n=e.response;if(t<200||t>299)return this.fire("error",n.message||n.error)});}_sendRequest(){const t=new FormData,e=this.xhr;return t.append("file",this.file),new Promise((n,i)=>{e.addEventListener("load",()=>{const t=e.status,o=e.response;return t<200||t>299?o.message?i(new Error(o.message)):i(o.error):n(o)}),e.addEventListener("error",()=>i(new Error("Network Error"))),e.addEventListener("abort",()=>i(new Error("Abort"))),e.send(t);})}}F($h,R);var Gh=$h;const Qh={refreshInterval:36e5,autoRefresh:!0};class Kh{constructor(t,e=Qh){if(!t)throw new Error("A `tokenUrl` must be provided as the first constructor argument.");this.set("value",e.initValue),this._refresh="function"==typeof t?t:()=>(function(t){return new Promise((e,n)=>{const i=new XMLHttpRequest;i.open("GET",t),i.addEventListener("load",()=>{const t=i.status,o=i.response;return t<200||t>299?n(new Error("Cannot download new token!")):e(o)}),i.addEventListener("error",()=>n(new Error("Network Error"))),i.addEventListener("abort",()=>n(new Error("Abort"))),i.send();})})(t),this._options=Object.assign({},Qh,e);}init(){return new Promise((t,e)=>{this._options.autoRefresh&&this._startRefreshing(),this.value?t(this):this._refreshToken().then(t).catch(e);})}_refreshToken(){return this._refresh().then(t=>this.set("value",t)).then(()=>this)}destroy(){this._stopRefreshing();}_startRefreshing(){this._refreshInterval=setInterval(()=>this._refreshToken(),this._options.refreshInterval);}_stopRefreshing(){clearInterval(this._refreshInterval);}static create(t,e=Qh){return new Kh(t,e).init()}}F(Kh,Li);var Jh=Kh;class Zh extends Nl{static get pluginName(){return "CloudServices"}init(){const t=this.editor.config.get("cloudServices")||{};for(const e in t)this[e]=t[e];if(this.tokenUrl)return this.token=new Zh.Token(this.tokenUrl),this.token.init();this.token=null;}}Zh.Token=Jh;class Xh extends Nl{static get requires(){return [Qu,Zh]}init(){const t=this.editor,e=t.plugins.get(Zh),n=e.token,i=e.uploadUrl;n&&(this._uploadGateway=new Xh._UploadGateway(n,i),t.plugins.get(Qu).createUploadAdapter=(t=>new tf(this._uploadGateway,t)));}}class tf{constructor(t,e){this.uploadGateway=t,this.loader=e;}upload(){return this.fileUploader=this.uploadGateway.upload(this.loader.file),this.fileUploader.on("progress",(t,e)=>{this.loader.uploadTotal=e.total,this.loader.uploaded=e.uploaded;}),this.fileUploader.send()}abort(){this.fileUploader.abort();}}Xh._UploadGateway=class{constructor(t,e){if(!t)throw new Error("Token must be provided");if(!e)throw new Error("Api address must be provided");this._token=t,this._apiAddress=e;}upload(t){return new Gh(t,this._token,this._apiAddress)}};class ef extends cr{constructor(t){super(t),this._observedElements=new Set;}observe(t,e){this.document.getRoot(e).on("change:children",(e,n)=>{this.view.once("render",()=>this._updateObservedElements(t,n));});}_updateObservedElements(t,e){if(!e.is("element")||e.is("attributeElement"))return;const n=this.view.domConverter.mapViewToDom(e);if(n){for(const t of n.querySelectorAll("img"))this._observedElements.has(t)||(this.listenTo(t,"load",(t,e)=>this._fireEvents(e)),this._observedElements.add(t));for(const e of this._observedElements)t.contains(e)||(this.stopListening(e),this._observedElements.delete(e));}}_fireEvents(t){this.isEnabled&&(this.document.fire("layoutChanged"),this.document.fire("imageLoaded",t));}destroy(){this._observedElements.clear(),super.destroy();}}function nf(t){return n=>{n.on(`attribute:${t}:image`,e);};function e(t,e,n){if(!n.consumable.consume(e.item,t.name))return;const i=n.writer,o=n.mapper.toViewElement(e.item).getChild(0);null!==e.attributeNewValue?i.setAttribute(e.attributeKey,e.attributeNewValue,o):i.removeAttribute(e.attributeKey,o);}}class of{constructor(){this._stack=[];}add(t,e){const n=this._stack,i=n[0];this._insertDescriptor(t);const o=n[0];i===o||rf(i,o)||this.fire("change:top",{oldDescriptor:i,newDescriptor:o,writer:e});}remove(t,e){const n=this._stack,i=n[0];this._removeDescriptor(t);const o=n[0];i===o||rf(i,o)||this.fire("change:top",{oldDescriptor:i,newDescriptor:o,writer:e});}_insertDescriptor(t){const e=this._stack,n=e.findIndex(e=>e.id===t.id);if(rf(t,e[n]))return;n>-1&&e.splice(n,1);let i=0;for(;e[i]&&sf(e[i],t);)i++;e.splice(i,0,t);}_removeDescriptor(t){const e=this._stack,n=e.findIndex(e=>e.id===t);n>-1&&e.splice(n,1);}}function rf(t,e){return t&&e&&t.priority==e.priority&&af(t.classes)==af(e.classes)}function sf(t,e){return t.priority>e.priority||!(t.priority<e.priority)&&af(t.classes)>af(e.classes)}function af(t){return Array.isArray(t)?t.sort().join(","):t}F(of,R);var cf=n(38),lf=n.n(cf);const df=Symbol("isWidget"),uf=Symbol("label"),hf="ck-widget",ff="ck-widget_selected";function mf(t){return !!t.is("element")&&!!t.getCustomProperty(df)}function gf(t,e,n={}){return co.isEdge||e.setAttribute("contenteditable","false",t),e.addClass(hf,t),e.setCustomProperty(df,!0,t),t.getFillerOffset=_f,n.label&&function(t,e,n){n.setCustomProperty(uf,e,t);}(t,n.label,e),n.hasSelectionHandler&&function(t,e){const n=e.createUIElement("div",{class:"ck ck-widget__selection-handler"},function(t){const e=this.toDomElement(t),n=new Pd;return n.set("content",lf.a),n.render(),e.appendChild(n.element),e});e.insert(e.createPositionAt(t,0),n),e.addClass(["ck-widget_selectable"],t);}(t,e),function(t,e,n,i){const o=new of;o.on("change:top",(e,o)=>{o.oldDescriptor&&i(t,o.oldDescriptor,o.writer),o.newDescriptor&&n(t,o.newDescriptor,o.writer);}),e.setCustomProperty("addHighlight",(t,e,n)=>o.add(e,n),t),e.setCustomProperty("removeHighlight",(t,e,n)=>o.remove(e,n),t);}(t,e,(t,e,n)=>n.addClass(i(e.classes),t),(t,e,n)=>n.removeClass(i(e.classes),t)),t;function i(t){return Array.isArray(t)?t:[t]}}function pf(t){const e=t.getCustomProperty(uf);return e?"function"==typeof e?e():e:""}function bf(t,e){return e.addClass(["ck-editor__editable","ck-editor__nested-editable"],t),co.isEdge||(e.setAttribute("contenteditable",t.isReadOnly?"false":"true",t),t.on("change:isReadOnly",(n,i,o)=>{e.setAttribute("contenteditable",o?"false":"true",t);})),t.on("change:isFocused",(n,i,o)=>{o?e.addClass("ck-editor__nested-editable_focused",t):e.removeClass("ck-editor__nested-editable_focused",t);}),t}function wf(t,e){const n=t.getSelectedElement();if(n)return e.createPositionAfter(n);const i=t.getSelectedBlocks().next().value;if(i){if(i.isEmpty)return e.createPositionAt(i,0);const n=e.createPositionAfter(i);return t.focus.isTouching(n)?n:e.createPositionBefore(i)}return t.focus}function _f(){return null}const kf=Symbol("isImage");function vf(t){const e=t.getSelectedElement();return !(!e||!function(t){return !!t.getCustomProperty(kf)&&mf(t)}(e))}function yf(t){return !!t&&t.is("image")}function xf(t,e,n={}){const i=t.createElement("image",n),o=wf(e.document.selection,e);e.insertContent(i,o),i.parent&&t.setSelection(i,"on");}function Af(t){const e=t.schema,n=t.document.selection;return function(t,e,n){const i=function(t,e){let n=wf(t,e).parent;n.is("$root")||(n=n.parent);return n}(t,n);return e.checkChild(i,"image")}(n,e,t)&&function(t,e){const n=t.getSelectedElement(),i=!!n&&e.isObject(n),o=!![...t.focus.getAncestors()].find(t=>e.isObject(t));return !i&&!o}(n,e)}class Cf extends jl{refresh(){this.isEnabled=Af(this.editor.model);}execute(t){const e=this.editor.model;e.change(n=>{const i=Array.isArray(t.source)?t.source:[t.source];for(const t of i)xf(n,e,{src:t});});}}class Tf extends Nl{init(){const t=this.editor,e=t.model.schema,n=t.t,i=t.conversion;t.editing.view.addObserver(ef),e.register("image",{isObject:!0,isBlock:!0,allowWhere:"$block",allowAttributes:["alt","src","srcset"]}),i.for("dataDowncast").add(aa({model:"image",view:(t,e)=>Pf(e)})),i.for("editingDowncast").add(aa({model:"image",view:(t,e)=>(function(t,e,n){return e.setCustomProperty(kf,!0,t),gf(t,e,{label:function(){const e=t.getChild(0).getAttribute("alt");return e?`${e} ${n}`:n}})})(Pf(e),e,n("aa"))})),i.for("downcast").add(nf("src")).add(nf("alt")).add(function(){return e=>{e.on("attribute:srcset:image",t);};function t(t,e,n){if(!n.consumable.consume(e.item,t.name))return;const i=n.writer,o=n.mapper.toViewElement(e.item).getChild(0);if(null===e.attributeNewValue){const t=e.attributeOldValue;t.data&&(i.removeAttribute("srcset",o),i.removeAttribute("sizes",o),t.width&&i.removeAttribute("width",o));}else{const t=e.attributeNewValue;t.data&&(i.setAttribute("srcset",t.data,o),i.setAttribute("sizes","100vw",o),t.width&&i.setAttribute("width",t.width,o));}}}()),i.for("upcast").add(Oa({view:{name:"img",attributes:{src:!0}},model:(t,e)=>e.createElement("image",{src:t.getAttribute("src")})})).add(Da({view:{name:"img",key:"alt"},model:"alt"})).add(Da({view:{name:"img",key:"srcset"},model:{key:"srcset",value:t=>{const e={data:t.getAttribute("srcset")};return t.hasAttribute("width")&&(e.width=t.getAttribute("width")),e}}})).add(function(){return e=>{e.on("element:figure",t);};function t(t,e,n){if(!n.consumable.test(e.viewItem,{name:!0,classes:"image"}))return;const i=Array.from(e.viewItem.getChildren()).find(t=>t.is("img"));if(!i||!i.hasAttribute("src")||!n.consumable.test(i,{name:!0}))return;const o=n.convertItem(i,e.modelCursor),r=Ld(o.modelRange.getItems());r&&(n.convertChildren(e.viewItem,n.writer.createPositionAt(r,0)),e.modelRange=o.modelRange,e.modelCursor=o.modelCursor);}}()),t.commands.add("imageInsert",new Cf(t));}}function Pf(t){const e=t.createEmptyElement("img"),n=t.createContainerElement("figure",{class:"image"});return t.insert(t.createPositionAt(n,0),e),n}class Mf extends Kr{constructor(t){super(t),this.domEventType="mousedown";}onDomEvent(t){this.fire(t.type,t);}}n(85);const Sf=mo("Ctrl+A");class If extends Nl{static get pluginName(){return "Widget"}init(){const t=this.editor.editing.view,e=t.document;this._previouslySelected=new Set,this.editor.editing.downcastDispatcher.on("selection",(t,e,n)=>{this._clearPreviouslySelectedWidgets(n.writer);const i=n.writer,o=i.document.selection,r=o.getSelectedElement();let s=null;for(const t of o.getRanges())for(const e of t){const t=e.item;mf(t)&&!Ef(t,s)&&(i.addClass(ff,t),this._previouslySelected.add(t),s=t,t==r&&i.setSelection(o.getRanges(),{fake:!0,label:pf(r)}));}},{priority:"low"}),t.addObserver(Mf),this.listenTo(e,"mousedown",(...t)=>this._onMousedown(...t)),this.listenTo(e,"keydown",(...t)=>this._onKeydown(...t),{priority:"high"}),this.listenTo(e,"delete",(t,e)=>{this._handleDelete("forward"==e.direction)&&(e.preventDefault(),t.stop());},{priority:"high"});}_onMousedown(t,e){const n=this.editor,i=n.editing.view,o=i.document;let r=e.target;if(function(t){for(;t;){if(t&&t.is("editableElement")&&!t.is("rootElement"))return !0;t=t.parent;}return !1}(r))return;if(!mf(r)&&!(r=r.findAncestor(mf)))return;e.preventDefault(),o.isFocused||i.focus();const s=n.editing.mapper.toModelElement(r);this._setSelectionOverElement(s);}_onKeydown(t,e){const n=e.keyCode,i=n==ho.delete||n==ho.arrowdown||n==ho.arrowright;let o=!1;!function(t){return t==ho.arrowright||t==ho.arrowleft||t==ho.arrowup||t==ho.arrowdown}(n)?!function(t){return fo(t)==Sf}(e)?n===ho.enter&&(o=this._handleEnterKey(e.shiftKey)):o=this._selectAllNestedEditableContent()||this._selectAllContent():o=this._handleArrowKeys(i),o&&(e.preventDefault(),t.stop());}_handleDelete(t){if(this.editor.isReadOnly)return;const e=this.editor.model.document.selection;if(!e.isCollapsed)return;const n=this._getObjectElementNextToSelection(t);return n?(this.editor.model.change(t=>{let i=e.anchor.parent;for(;i.isEmpty;){const e=i;i=e.parent,t.remove(e);}this._setSelectionOverElement(n);}),!0):void 0}_handleArrowKeys(t){const e=this.editor.model,n=e.schema,i=e.document.selection,o=i.getSelectedElement();if(o&&n.isObject(o)){const o=t?i.getLastPosition():i.getFirstPosition(),r=n.getNearestSelectionRange(o,t?"forward":"backward");return r&&e.change(t=>{t.setSelection(r);}),!0}if(!i.isCollapsed)return;const r=this._getObjectElementNextToSelection(t);return r&&n.isObject(r)?(this._setSelectionOverElement(r),!0):void 0}_handleEnterKey(t){const e=this.editor.model,n=e.document.selection.getSelectedElement();if(n&&e.schema.isObject(n))return e.change(e=>{const i=e.createElement("paragraph");e.insert(i,n,t?"before":"after"),e.setSelection(i,"in");}),!0}_selectAllNestedEditableContent(){const t=this.editor.model,e=t.document.selection,n=t.schema.getLimitElement(e);return e.getFirstRange().root!=n&&(t.change(t=>{t.setSelection(t.createRangeIn(n));}),!0)}_selectAllContent(){const t=this.editor.model,e=this.editor.editing,n=e.view.document.selection.getSelectedElement();if(n&&mf(n)){const i=e.mapper.toModelElement(n.parent);return t.change(t=>{t.setSelection(t.createRangeIn(i));}),!0}return !1}_setSelectionOverElement(t){this.editor.model.change(e=>{e.setSelection(e.createRangeOn(t));});}_getObjectElementNextToSelection(t){const e=this.editor.model,n=e.schema,i=e.document.selection,o=e.createSelection(i);e.modifySelection(o,{direction:t?"forward":"backward"});const r=t?o.focus.nodeBefore:o.focus.nodeAfter;return r&&n.isObject(r)?r:null}_clearPreviouslySelectedWidgets(t){for(const e of this._previouslySelected)t.removeClass(ff,e);this._previouslySelected.clear();}}function Ef(t,e){return !!e&&Array.from(t.getAncestors()).includes(e)}class Nf extends jl{refresh(){const t=this.editor.model.document.selection.getSelectedElement();this.isEnabled=yf(t),yf(t)&&t.hasAttribute("alt")?this.value=t.getAttribute("alt"):this.value=!1;}execute(t){const e=this.editor.model,n=e.document.selection.getSelectedElement();e.change(e=>{e.setAttribute("alt",t.newValue,n);});}}class Of extends Nl{init(){this.editor.commands.add("imageTextAlternative",new Nf(this.editor));}}n(87);class Rf extends yl{constructor(t){super(t),this.set("text"),this.set("for");const e=this.bindTemplate;this.setTemplate({tag:"label",attributes:{class:["ck","ck-label"],for:e.to("for")},children:[{text:e.to("text")}]});}}n(89);class Df extends yl{constructor(t,e){super(t);const n=`ck-input-${I()}`,i=`ck-status-${I()}`;this.set("label"),this.set("value"),this.set("isReadOnly",!1),this.set("errorText",null),this.set("infoText",null),this.labelView=this._createLabelView(n),this.inputView=this._createInputView(e,n,i),this.statusView=this._createStatusView(i),this.bind("_statusText").to(this,"errorText",this,"infoText",(t,e)=>t||e);const o=this.bindTemplate;this.setTemplate({tag:"div",attributes:{class:["ck","ck-labeled-input",o.if("isReadOnly","ck-disabled")]},children:[this.labelView,this.inputView,this.statusView]});}_createLabelView(t){const e=new Rf(this.locale);return e.for=t,e.bind("text").to(this,"label"),e}_createInputView(t,e,n){const i=new t(this.locale,n);return i.id=e,i.ariaDesribedById=n,i.bind("value").to(this),i.bind("isReadOnly").to(this),i.bind("hasError").to(this,"errorText",t=>!!t),i.on("input",()=>{this.errorText=null;}),i}_createStatusView(t){const e=new yl(this.locale),n=this.bindTemplate;return e.setTemplate({tag:"div",attributes:{class:["ck","ck-labeled-input__status",n.if("errorText","ck-labeled-input__status_error"),n.if("_statusText","ck-hidden",t=>!t)],id:t},children:[{text:n.to("_statusText")}]}),e}select(){this.inputView.select();}focus(){this.inputView.focus();}}n(91);class Lf extends yl{constructor(t){super(t),this.set("value"),this.set("id"),this.set("placeholder"),this.set("isReadOnly",!1),this.set("hasError",!1),this.set("ariaDesribedById");const e=this.bindTemplate;this.setTemplate({tag:"input",attributes:{type:"text",class:["ck","ck-input","ck-input-text",e.if("hasError","ck-error")],id:e.to("id"),placeholder:e.to("placeholder"),readonly:e.to("isReadOnly"),"aria-invalid":e.if("hasError",!0),"aria-describedby":e.to("ariaDesribedById")},on:{input:e.to("input")}});}render(){super.render();const t=t=>{this.element.value=t||0===t?t:"";};t(this.value),this.on("change:value",(e,n,i)=>{t(i);});}select(){this.element.select();}focus(){this.element.focus();}}function jf({view:t}){t.listenTo(t.element,"submit",(e,n)=>{n.preventDefault(),t.fire("submit");},{useCapture:!0});}var Vf=n(7),zf=n.n(Vf),Bf=n(8),Ff=n.n(Bf);n(93);class Uf extends yl{constructor(t){super(t);const e=this.locale.t;this.focusTracker=new Kc,this.keystrokes=new Uc,this.labeledInput=this._createLabeledInputView(),this.saveButtonView=this._createButton(e("br"),zf.a,"ck-button-save"),this.saveButtonView.type="submit",this.cancelButtonView=this._createButton(e("bs"),Ff.a,"ck-button-cancel","cancel"),this._focusables=new Xc,this._focusCycler=new Tl({focusables:this._focusables,focusTracker:this.focusTracker,keystrokeHandler:this.keystrokes,actions:{focusPrevious:"shift + tab",focusNext:"tab"}}),this.setTemplate({tag:"form",attributes:{class:["ck","ck-text-alternative-form"],tabindex:"-1"},children:[this.labeledInput,this.saveButtonView,this.cancelButtonView]});}render(){super.render(),this.keystrokes.listenTo(this.element),jf({view:this}),[this.labeledInput,this.saveButtonView,this.cancelButtonView].forEach(t=>{this._focusables.add(t),this.focusTracker.add(t.element);});}_createButton(t,e,n,i){const o=new Sd(this.locale);return o.set({label:t,icon:e,tooltip:!0}),o.extendTemplate({attributes:{class:n}}),i&&o.delegate("execute").to(this,i),o}_createLabeledInputView(){const t=this.locale.t,e=new Df(this.locale,Lf);return e.label=t("bv"),e.inputView.placeholder=t("bv"),e}}n(95);const Hf=function(t){return e=>e+t}("px"),qf=Jo.document.body;class Wf extends yl{constructor(t){super(t);const e=this.bindTemplate;this.set("top",0),this.set("left",0),this.set("position","arrow_nw"),this.set("isVisible",!1),this.set("withArrow",!0),this.set("className"),this.content=this.createCollection(),this.setTemplate({tag:"div",attributes:{class:["ck","ck-balloon-panel",e.to("position",t=>`ck-balloon-panel_${t}`),e.if("isVisible","ck-balloon-panel_visible"),e.if("withArrow","ck-balloon-panel_with-arrow"),e.to("className")],style:{top:e.to("top",Hf),left:e.to("left",Hf)}},children:this.content});}show(){this.isVisible=!0;}hide(){this.isVisible=!1;}attachTo(t){this.show();const e=Wf.defaultPositions,n=Object.assign({},{element:this.element,positions:[e.southArrowNorth,e.southArrowNorthWest,e.southArrowNorthEast,e.northArrowSouth,e.northArrowSouthWest,e.northArrowSouthEast],limiter:qf,fitInViewport:!0},t),{top:i,left:o,name:r}=Wf._getOptimalPosition(n);Object.assign(this,{top:i,left:o,position:r});}pin(t){this.unpin(),this._pinWhenIsVisibleCallback=(()=>{this.isVisible?this._startPinning(t):this._stopPinning();}),this._startPinning(t),this.listenTo(this,"change:isVisible",this._pinWhenIsVisibleCallback);}unpin(){this._pinWhenIsVisibleCallback&&(this._stopPinning(),this.stopListening(this,"change:isVisible",this._pinWhenIsVisibleCallback),this._pinWhenIsVisibleCallback=null,this.hide());}_startPinning(t){this.attachTo(t);const e=Yf(t.target),n=t.limiter?Yf(t.limiter):qf;this.listenTo(Jo.document,"scroll",(i,o)=>{const r=o.target,s=e&&r.contains(e),a=n&&r.contains(n);!s&&!a&&e&&n||this.attachTo(t);},{useCapture:!0}),this.listenTo(Jo.window,"resize",()=>{this.attachTo(t);});}_stopPinning(){this.stopListening(Jo.document,"scroll"),this.stopListening(Jo.window,"resize");}}function Yf(t){return tr(t)?t:bs(t)?t.commonAncestorContainer:"function"==typeof t?Yf(t()):null}function $f(t,e){return t.top-e.height-Wf.arrowVerticalOffset}function Gf(t){return t.bottom+Wf.arrowVerticalOffset}Wf.arrowHorizontalOffset=25,Wf.arrowVerticalOffset=10,Wf._getOptimalPosition=qd,Wf.defaultPositions={northArrowSouth:(t,e)=>({top:$f(t,e),left:t.left+t.width/2-e.width/2,name:"arrow_s"}),northArrowSouthEast:(t,e)=>({top:$f(t,e),left:t.left+t.width/2-e.width+Wf.arrowHorizontalOffset,name:"arrow_se"}),northArrowSouthWest:(t,e)=>({top:$f(t,e),left:t.left+t.width/2-Wf.arrowHorizontalOffset,name:"arrow_sw"}),northWestArrowSouth:(t,e)=>({top:$f(t,e),left:t.left-e.width/2,name:"arrow_s"}),northWestArrowSouthWest:(t,e)=>({top:$f(t,e),left:t.left-Wf.arrowHorizontalOffset,name:"arrow_sw"}),northWestArrowSouthEast:(t,e)=>({top:$f(t,e),left:t.left-e.width+Wf.arrowHorizontalOffset,name:"arrow_se"}),northEastArrowSouth:(t,e)=>({top:$f(t,e),left:t.right-e.width/2,name:"arrow_s"}),northEastArrowSouthEast:(t,e)=>({top:$f(t,e),left:t.right-e.width+Wf.arrowHorizontalOffset,name:"arrow_se"}),northEastArrowSouthWest:(t,e)=>({top:$f(t,e),left:t.right-Wf.arrowHorizontalOffset,name:"arrow_sw"}),southArrowNorth:(t,e)=>({top:Gf(t),left:t.left+t.width/2-e.width/2,name:"arrow_n"}),southArrowNorthEast:(t,e)=>({top:Gf(t),left:t.left+t.width/2-e.width+Wf.arrowHorizontalOffset,name:"arrow_ne"}),southArrowNorthWest:(t,e)=>({top:Gf(t),left:t.left+t.width/2-Wf.arrowHorizontalOffset,name:"arrow_nw"}),southWestArrowNorth:(t,e)=>({top:Gf(t),left:t.left-e.width/2,name:"arrow_n"}),southWestArrowNorthWest:(t,e)=>({top:Gf(t),left:t.left-Wf.arrowHorizontalOffset,name:"arrow_nw"}),southWestArrowNorthEast:(t,e)=>({top:Gf(t),left:t.left-e.width+Wf.arrowHorizontalOffset,name:"arrow_ne"}),southEastArrowNorth:(t,e)=>({top:Gf(t),left:t.right-e.width/2,name:"arrow_n"}),southEastArrowNorthEast:(t,e)=>({top:Gf(t),left:t.right-e.width+Wf.arrowHorizontalOffset,name:"arrow_ne"}),southEastArrowNorthWest:(t,e)=>({top:Gf(t),left:t.right-Wf.arrowHorizontalOffset,name:"arrow_nw"})};class Qf extends Nl{static get pluginName(){return "ContextualBalloon"}init(){this.view=new Wf,this.positionLimiter=(()=>{const t=this.editor.editing.view,e=t.document.selection.editableElement;return e?t.domConverter.mapViewToDom(e.root):null}),this._stack=new Map,this.editor.ui.view.body.add(this.view),this.editor.ui.focusTracker.add(this.view.element);}get visibleView(){const t=this._stack.get(this.view.content.get(0));return t?t.view:null}hasView(t){return this._stack.has(t)}add(t){if(this.hasView(t.view))throw new P.b("contextualballoon-add-view-exist: Cannot add configuration of the same view twice.");this.visibleView&&this.view.content.remove(this.visibleView),this._stack.set(t.view,t),this._show(t);}remove(t){if(!this.hasView(t))throw new P.b("contextualballoon-remove-view-not-exist: Cannot remove configuration of not existing view.");if(this.visibleView===t){this.view.content.remove(t),this._stack.delete(t);const e=Array.from(this._stack.values()).pop();e?this._show(e):this.view.hide();}else this._stack.delete(t);}updatePosition(t){t&&(this._stack.get(this.visibleView).position=t),this.view.pin(this._getBalloonPosition());}_show({view:t,balloonClassName:e=""}){this.view.className=e,this.view.content.add(t),this.view.pin(this._getBalloonPosition());}_getBalloonPosition(){let t=Array.from(this._stack.values()).pop().position;return t&&!t.limiter&&(t=Object.assign({},t,{limiter:this.positionLimiter})),t}}var Kf=n(39),Jf=n.n(Kf);function Zf(t){const e=t.editing.view,n=Wf.defaultPositions;return {target:e.domConverter.viewToDom(e.document.selection.getSelectedElement()),positions:[n.northArrowSouth,n.northArrowSouthWest,n.northArrowSouthEast,n.southArrowNorth,n.southArrowNorthWest,n.southArrowNorthEast]}}class Xf extends Nl{static get requires(){return [Qf]}init(){this._createButton(),this._createForm();}_createButton(){const t=this.editor,e=t.t;t.ui.componentFactory.add("imageTextAlternative",n=>{const i=t.commands.get("imageTextAlternative"),o=new Sd(n);return o.set({label:e("bl"),icon:Jf.a,tooltip:!0}),o.bind("isEnabled").to(i,"isEnabled"),this.listenTo(o,"execute",()=>this._showForm()),o});}_createForm(){const t=this.editor,e=t.editing.view.document;this._balloon=this.editor.plugins.get("ContextualBalloon"),this._form=new Uf(t.locale),this._form.render(),this.listenTo(this._form,"submit",()=>{t.execute("imageTextAlternative",{newValue:this._form.labeledInput.inputView.element.value}),this._hideForm(!0);}),this.listenTo(this._form,"cancel",()=>{this._hideForm(!0);}),this._form.keystrokes.set("Esc",(t,e)=>{this._hideForm(!0),e();}),this.listenTo(t.ui,"update",()=>{vf(e.selection)?this._isVisible&&function(t){const e=t.plugins.get("ContextualBalloon");if(vf(t.editing.view.document.selection)){const n=Zf(t);e.updatePosition(n);}}(t):this._hideForm(!0);}),eu({emitter:this._form,activator:()=>this._isVisible,contextElements:[this._form.element],callback:()=>this._hideForm()});}_showForm(){if(this._isVisible)return;const t=this.editor,e=t.commands.get("imageTextAlternative"),n=this._form.labeledInput;this._balloon.hasView(this._form)||this._balloon.add({view:this._form,position:Zf(t)}),n.value=n.inputView.element.value=e.value||"",this._form.labeledInput.select();}_hideForm(t){this._isVisible&&(this._balloon.remove(this._form),t&&this.editor.editing.view.focus());}get _isVisible(){return this._balloon.visibleView==this._form}}class tm extends Nl{static get requires(){return [Of,Xf]}static get pluginName(){return "ImageTextAlternative"}}n(97);class em extends Nl{static get requires(){return [Tf,If,tm]}static get pluginName(){return "Image"}}class nm extends yl{constructor(t){super(t),this.buttonView=new Sd(t),this._fileInputView=new im(t),this._fileInputView.bind("acceptedType").to(this),this._fileInputView.bind("allowMultipleFiles").to(this),this._fileInputView.delegate("done").to(this),this.setTemplate({tag:"span",attributes:{class:"ck-file-dialog-button"},children:[this.buttonView,this._fileInputView]}),this.buttonView.on("execute",()=>{this._fileInputView.open();});}focus(){this.buttonView.focus();}}class im extends yl{constructor(t){super(t),this.set("acceptedType"),this.set("allowMultipleFiles",!1);const e=this.bindTemplate;this.setTemplate({tag:"input",attributes:{class:["ck-hidden"],type:"file",tabindex:"-1",accept:e.to("acceptedType"),multiple:e.to("allowMultipleFiles")},on:{change:e.to(()=>{this.element&&this.element.files&&this.element.files.length&&this.fire("done",this.element.files),this.element.value="";})}});}open(){this.element.click();}}var om=n(40),rm=n.n(om);function sm(t){return /^image\/(jpeg|png|gif|bmp)$/.test(t.type)}function am(t){return new Promise(e=>{fetch(t.getAttribute("src")).then(t=>t.blob()).then(n=>{const i=function(t,e){return t.type?t.type:e.match(/data:(image\/\w+);base64/)?e.match(/data:(image\/\w+);base64/)[1].toLowerCase():"image/jpeg"}(n,t.getAttribute("src")),o=function(t,e,n){try{return new File([t],e,{type:n})}catch(t){return null}}(n,`image.${i.replace("image/","")}`,i);e({image:t,file:o});}).catch(()=>{e({image:t,file:null});});})}class cm extends Nl{init(){const t=this.editor,e=t.t;t.ui.componentFactory.add("imageUpload",n=>{const i=new nm(n),o=t.commands.get("imageUpload");return i.set({acceptedType:"image/*",allowMultipleFiles:!0}),i.buttonView.set({label:e("ae"),icon:rm.a,tooltip:!0}),i.buttonView.bind("isEnabled").to(o),i.on("done",(e,n)=>{const i=Array.from(n).filter(sm);i.length&&t.execute("imageUpload",{file:i});}),i});}}var lm=n(41),dm=n.n(lm);n(99),n(101),n(103);class um extends Nl{constructor(t){super(t),this.placeholder="data:image/svg+xml;utf8,"+encodeURIComponent(dm.a);}init(){this.editor.editing.downcastDispatcher.on("attribute:uploadStatus:image",(...t)=>this.uploadStatusChange(...t));}uploadStatusChange(t,e,n){const i=this.editor,o=e.item,r=o.getAttribute("uploadId");if(!n.consumable.consume(e.item,t.name))return;const s=i.plugins.get(Qu),a=r?e.attributeNewValue:null,c=this.placeholder,l=i.editing.mapper.toViewElement(o),d=n.writer;if("reading"==a)return mm(l,d),void gm(c,l,d);if("uploading"==a){const t=s.loaders.get(r);return mm(l,d),void(t?(pm(l,d),function(t,e,n,i){const o=function(t){const e=t.createUIElement("div",{class:"ck-progress-bar"});return t.setCustomProperty(hm,!0,e),e}(e);e.insert(e.createPositionAt(t,"end"),o),n.on("change:uploadedPercent",(t,e,n)=>{i.change(t=>{t.setStyle("width",n+"%",o);});});}(l,d,t,i.editing.view)):gm(c,l,d))}"complete"==a&&s.loaders.get(r)&&!co.isEdge&&function(t,e,n){const i=e.createUIElement("div",{class:"ck-image-upload-complete-icon"});e.insert(e.createPositionAt(t,"end"),i),setTimeout(()=>{n.change(t=>t.remove(t.createRangeOn(i)));},3e3);}(l,d,i.editing.view),function(t,e){wm(t,e,hm);}(l,d),pm(l,d),function(t,e){e.removeClass("ck-appear",t);}(l,d);}}const hm=Symbol("progress-bar"),fm=Symbol("placeholder");function mm(t,e){t.hasClass("ck-appear")||e.addClass("ck-appear",t);}function gm(t,e,n){e.hasClass("ck-image-upload-placeholder")||n.addClass("ck-image-upload-placeholder",e);const i=e.getChild(0);i.getAttribute("src")!==t&&n.setAttribute("src",t,i),bm(e,fm)||n.insert(n.createPositionAfter(i),function(t){const e=t.createUIElement("div",{class:"ck-upload-placeholder-loader"});return t.setCustomProperty(fm,!0,e),e}(n));}function pm(t,e){t.hasClass("ck-image-upload-placeholder")&&e.removeClass("ck-image-upload-placeholder",t),wm(t,e,fm);}function bm(t,e){for(const n of t.getChildren())if(n.getCustomProperty(e))return n}function wm(t,e,n){const i=bm(t,n);i&&e.remove(e.createRangeOn(i));}class _m{createDocumentFragment(t){return new _o(t)}createElement(t,e,n){return new mi(t,e,n)}createText(t){return new ci(t)}clone(t,e=!1){return t._clone(e)}appendChild(t,e){return e._appendChild(t)}insertChild(t,e,n){return n._insertChild(t,e)}removeChildren(t,e,n){return n._removeChildren(t,e)}remove(t){const e=t.parent;return e?this.removeChildren(e.getChildIndex(t),1,e):[]}replace(t,e){const n=t.parent;if(n){const i=n.getChildIndex(t);return this.removeChildren(i,1,n),this.insertChild(i,e,n),!0}return !1}rename(t,e){const n=new mi(t,e.getAttributes(),e.getChildren());return this.replace(e,n)?n:null}setAttribute(t,e,n){n._setAttribute(t,e);}removeAttribute(t,e){e._removeAttribute(t);}addClass(t,e){e._addClass(t);}removeClass(t,e){e._removeClass(t);}setStyle(t,e,n){C(t)&&void 0===n&&(n=e),n._setStyle(t,e);}removeStyle(t,e){e._removeStyle(t);}setCustomProperty(t,e,n){n._setCustomProperty(t,e);}removeCustomProperty(t,e){return e._removeCustomProperty(t)}createPositionAt(t,e){return $i._createAt(t,e)}createPositionAfter(t){return $i._createAfter(t)}createPositionBefore(t){return $i._createBefore(t)}createRange(t,e){return new Gi(t,e)}createRangeOn(t){return Gi._createOn(t)}createRangeIn(t){return Gi._createIn(t)}createSelection(t,e,n){return new Ji(t,e,n)}}class km extends jl{refresh(){this.isEnabled=Af(this.editor.model);}execute(t){const e=this.editor,n=e.model,i=e.plugins.get(Qu);n.change(e=>{const o=Array.isArray(t.file)?t.file:[t.file];for(const t of o)vm(e,n,i,t);});}}function vm(t,e,n,i){const o=n.createLoader(i);o&&xf(t,e,{uploadId:o.id});}class ym extends Nl{static get requires(){return [Qu,Uh]}init(){const t=this.editor,e=t.model.document,n=t.model.schema,i=t.conversion,o=t.plugins.get(Qu);n.extend("image",{allowAttributes:["uploadId","uploadStatus"]}),t.commands.add("imageUpload",new km(t)),i.for("upcast").add(Da({view:{name:"img",key:"uploadId"},model:"uploadId"})),this.listenTo(t.editing.view.document,"clipboardInput",(e,n)=>{if(function(t){return Array.from(t.types).includes("text/html")&&""!==t.getData("text/html")}(n.dataTransfer))return;const i=Array.from(n.dataTransfer.files).filter(t=>!!t&&sm(t)),o=n.targetRanges.map(e=>t.editing.mapper.toModelRange(e));t.model.change(n=>{n.setSelection(o),i.length&&(e.stop(),t.model.enqueueChange("default",()=>{t.execute("imageUpload",{file:i});}));});}),this.listenTo(t.plugins.get("Clipboard"),"inputTransformation",(e,n)=>{const i=Array.from(t.editing.view.createRangeIn(n.content)).filter(t=>(function(t){return !(!t.is("element","img")||!t.getAttribute("src"))&&(t.getAttribute("src").match(/^data:image\/\w+;base64,/g)||t.getAttribute("src").match(/^blob:/g))})(t.item)&&!t.item.getAttribute("uploadProcessed")).map(t=>am(t.item));i.length&&(e.stop(),Promise.all(i).then(e=>{const i=new _m;for(const t of e)if(t.file){i.setAttribute("uploadProcessed",!0,t.image);const e=o.createLoader(t.file);e&&(i.setAttribute("src","",t.image),i.setAttribute("uploadId",e.id,t.image));}else i.remove(t.image);t.plugins.get("Clipboard").fire("inputTransformation",n);}));}),t.editing.view.document.on("dragover",(t,e)=>{e.preventDefault();}),e.on("change",()=>{const t=e.differ.getChanges({includeChangesInGraveyard:!0});for(const e of t)if("insert"==e.type&&"image"==e.name){const t=e.position.nodeAfter,n="$graveyard"==e.position.root.rootName,i=t.getAttribute("uploadId");if(!i)continue;const r=o.loaders.get(i);if(!r)continue;n?r.abort():"idle"==r.status&&this._readAndUpload(r,t);}});}_readAndUpload(t,e){const n=this.editor,i=n.model,o=n.locale.t,r=n.plugins.get(Qu),s=n.plugins.get(Uh);return i.enqueueChange("transparent",t=>{t.setAttribute("uploadStatus","reading",e);}),t.read().then(o=>{const r=n.editing.mapper.toViewElement(e).getChild(0),s=t.upload();return n.editing.view.change(t=>{t.setAttribute("src",o,r);}),i.enqueueChange("transparent",t=>{t.setAttribute("uploadStatus","uploading",e);}),s}).then(t=>{i.enqueueChange("transparent",n=>{n.setAttributes({uploadStatus:"complete",src:t.default},e),this._parseAndSetSrcsetAttributeOnImage(t,e,n);}),a();}).catch(n=>{if("error"!==t.status&&"aborted"!==t.status)throw n;"error"==t.status&&s.showWarning(n,{title:o("be"),namespace:"upload"}),a(),i.enqueueChange("transparent",t=>{t.remove(e);});});function a(){i.enqueueChange("transparent",t=>{t.removeAttribute("uploadId",e),t.removeAttribute("uploadStatus",e);}),r.destroyLoader(t);}}_parseAndSetSrcsetAttributeOnImage(t,e,n){let i=0;const o=Object.keys(t).filter(t=>{const e=parseInt(t,10);if(!isNaN(e))return i=Math.max(i,e),!0}).map(e=>`${t[e]} ${e}w`).join(", ");""!=o&&n.setAttribute("srcset",{data:o,width:i},e);}}class xm extends Nl{static get pluginName(){return "ImageUpload"}static get requires(){return [ym,cm,um]}}class Am extends jl{refresh(){const t=this.editor.model,e=Ld(t.document.selection.getSelectedBlocks());this.value=!!e&&e.is("paragraph"),this.isEnabled=!!e&&Cm(e,t.schema);}execute(t={}){const e=this.editor.model,n=e.document;e.change(i=>{const o=(t.selection||n.selection).getSelectedBlocks();for(const t of o)!t.is("paragraph")&&Cm(t,e.schema)&&i.rename(t,"paragraph");});}}function Cm(t,e){return e.checkChild(t.parent,"paragraph")&&!e.isObject(t)}class Tm extends Nl{static get pluginName(){return "Paragraph"}init(){const t=this.editor,e=t.model,n=t.data;t.commands.add("paragraph",new Am(t)),e.schema.register("paragraph",{inheritAllFrom:"$block"}),t.conversion.elementToElement({model:"paragraph",view:"p"}),n.upcastDispatcher.on("element",(t,e,n)=>{const i=n.writer;if(n.consumable.test(e.viewItem,{name:e.viewItem.name}))if(Tm.paragraphLikeElements.has(e.viewItem.name)){if(e.viewItem.isEmpty)return;const t=i.createElement("paragraph"),o=n.splitToAllowedParent(t,e.modelCursor);if(!o)return;i.insert(t,o.position);const{modelRange:r}=n.convertChildren(e.viewItem,i.createPositionAt(t,0));e.modelRange=i.createRange(i.createPositionBefore(t),r.end),e.modelCursor=e.modelRange.end;}else Mm(e.viewItem,e.modelCursor,n.schema)&&(e=Object.assign(e,Pm(e.viewItem,e.modelCursor,n)));},{priority:"low"}),n.upcastDispatcher.on("text",(t,e,n)=>{e.modelRange||Mm(e.viewItem,e.modelCursor,n.schema)&&(e=Object.assign(e,Pm(e.viewItem,e.modelCursor,n)));},{priority:"lowest"}),e.document.registerPostFixer(t=>this._autoparagraphEmptyRoots(t)),t.on("dataReady",()=>{e.enqueueChange("transparent",t=>this._autoparagraphEmptyRoots(t));},{priority:"lowest"});}_autoparagraphEmptyRoots(t){const e=this.editor.model;for(const n of e.document.getRootNames()){const i=e.document.getRoot(n);if(i.isEmpty&&"$graveyard"!=i.rootName&&e.schema.checkChild(i,"paragraph"))return t.insertElement("paragraph",i),!0}}}function Pm(t,e,n){const i=n.writer.createElement("paragraph");return n.writer.insert(i,e),n.convertItem(t,n.writer.createPositionAt(i,0))}function Mm(t,e,n){const i=n.createContext(e);return !!n.checkChild(i,"paragraph")&&!!n.checkChild(i.push("paragraph"),t)}Tm.paragraphLikeElements=new Set(["blockquote","dd","div","dt","h1","h2","h3","h4","h5","h6","li","p","td"]);class Sm extends jl{constructor(t,e){super(t),this.modelElements=e;}refresh(){const t=Ld(this.editor.model.document.selection.getSelectedBlocks());this.value=!!t&&this.modelElements.includes(t.name)&&t.name,this.isEnabled=!!t&&this.modelElements.some(e=>Im(t,e,this.editor.model.schema));}execute(t){const e=this.editor.model,n=e.document,i=t.value;e.change(t=>{const o=Array.from(n.selection.getSelectedBlocks()).filter(t=>Im(t,i,e.schema));for(const e of o)e.is(i)||t.rename(e,i);});}}function Im(t,e,n){return n.checkChild(t.parent,e)&&!n.isObject(t)}const Em="paragraph";class Nm extends Nl{constructor(t){super(t),t.config.define("heading",{options:[{model:"paragraph",title:"Paragraph",class:"ck-heading_paragraph"},{model:"heading1",view:"h2",title:"Heading 1",class:"ck-heading_heading1"},{model:"heading2",view:"h3",title:"Heading 2",class:"ck-heading_heading2"},{model:"heading3",view:"h4",title:"Heading 3",class:"ck-heading_heading3"}]});}static get requires(){return [Tm]}init(){const t=this.editor,e=t.config.get("heading.options"),n=[];for(const i of e)i.model!==Em&&(t.model.schema.register(i.model,{inheritAllFrom:"$block"}),t.conversion.elementToElement(i),n.push(i.model));this._addDefaultH1Conversion(t),t.commands.add("heading",new Sm(t,n));}afterInit(){const t=this.editor,e=t.commands.get("enter"),n=t.config.get("heading.options");e&&this.listenTo(e,"afterExecute",(e,i)=>{const o=t.model.document.selection.getFirstPosition().parent;n.some(t=>o.is(t.model))&&!o.is(Em)&&0===o.childCount&&i.writer.rename(o,Em);});}_addDefaultH1Conversion(t){t.conversion.for("upcast").add(Oa({model:"heading1",view:"h1",converterPriority:E.get("low")+1}));}}n(19);class Om extends Nl{init(){const t=this.editor,e=t.t,n=function(t){const e=t.t,n={Paragraph:e("cd"),"Heading 1":e("ce"),"Heading 2":e("cf"),"Heading 3":e("cg")};return t.config.get("heading.options").map(t=>{const e=n[t.title];return e&&e!=t.title&&(t=Object.assign({},t,{title:e})),t})}(t),i=e("ac"),o=e("ad");t.ui.componentFactory.add("heading",e=>{const r={},s=new Xi,a=t.commands.get("heading"),c=t.commands.get("paragraph"),l=[a];for(const t of n){const e={type:"button",model:new xu({label:t.title,class:t.class,withText:!0})};"paragraph"===t.model?(e.model.bind("isOn").to(c,"value"),e.model.set("commandName","paragraph"),l.push(c)):(e.model.bind("isOn").to(a,"value",e=>e===t.model),e.model.set({commandName:"heading",commandValue:t.model})),s.add(e),r[t.model]=t.title;}const d=nu(e);return ou(d,s),d.buttonView.set({isOn:!1,withText:!0,tooltip:o}),d.extendTemplate({attributes:{class:["ck-heading-dropdown"]}}),d.bind("isEnabled").toMany(l,"isEnabled",(...t)=>t.some(t=>t)),d.buttonView.bind("label").to(a,"value",c,"value",(t,e)=>{const n=t||e&&"paragraph";return r[n]?r[n]:i}),this.listenTo(d,"execute",e=>{t.execute(e.source.commandName,e.source.commandValue?{value:e.source.commandValue}:void 0),t.editing.view.focus();}),d});}}n(106);const Rm=new WeakMap;function Dm(t,e,n,i){const o=t.document;Rm.has(o)||(Rm.set(o,new Map),o.registerPostFixer(t=>(function(t,e){const n=Rm.get(t);let i=!1;for(const[t,o]of n)Lm(e,t,o)&&(i=!0);return i})(o,t))),Rm.get(o).set(e,{placeholderText:n,checkFunction:i}),t.render();}function Lm(t,e,n){const i=e.document,o=n.placeholderText;let r=!1;if(!i)return !1;e.getAttribute("data-placeholder")!==o&&(t.setAttribute("data-placeholder",o,e),r=!0);const s=i.selection.anchor,a=n.checkFunction;if(a&&!a())return e.hasClass("ck-placeholder")&&(t.removeClass("ck-placeholder",e),r=!0),r;const c=!Array.from(e.getChildren()).some(t=>!t.is("uiElement"));return !i.isFocused&&c?(e.hasClass("ck-placeholder")||(t.addClass("ck-placeholder",e),r=!0),r):(c&&s&&s.parent!==e?e.hasClass("ck-placeholder")||(t.addClass("ck-placeholder",e),r=!0):e.hasClass("ck-placeholder")&&(t.removeClass("ck-placeholder",e),r=!0),r)}const jm=Symbol("imageCaption");function Vm(t){for(const e of t.getChildren())if(e&&e.is("caption"))return e;return null}function zm(t){const e=t.parent;return "figcaption"==t.name&&e&&"figure"==e.name&&e.hasClass("image")?{name:!0}:null}class Bm extends Nl{init(){const t=this.editor,e=t.editing.view,n=t.model.schema,i=t.data,o=t.editing,r=t.t;n.register("caption",{allowIn:"image",allowContentOf:"$block",isLimit:!0}),t.model.document.registerPostFixer(t=>this._insertMissingModelCaptionElement(t)),t.conversion.for("upcast").add(Oa({view:zm,model:"caption"}));i.downcastDispatcher.on("insert:caption",Fm(t=>t.createContainerElement("figcaption"),!1));const s=function(t,e){return n=>{const i=n.createEditableElement("figcaption");return n.setCustomProperty(jm,!0,i),Dm(t,i,e),bf(i,n)}}(e,r("bg"));o.downcastDispatcher.on("insert:caption",Fm(s)),o.downcastDispatcher.on("insert",this._fixCaptionVisibility(t=>t.item),{priority:"high"}),o.downcastDispatcher.on("remove",this._fixCaptionVisibility(t=>t.position.parent),{priority:"high"}),e.document.registerPostFixer(t=>this._updateCaptionVisibility(t));}_updateCaptionVisibility(t){const e=this.editor.editing.mapper,n=this._lastSelectedCaption;let i;const o=this.editor.model.document.selection,r=o.getSelectedElement();if(r&&r.is("image")){const t=Vm(r);i=e.toViewElement(t);}const s=Um(o.getFirstPosition().parent);if(s&&(i=e.toViewElement(s)),i)return n?n===i?qm(i,t):(Hm(n,t),this._lastSelectedCaption=i,qm(i,t)):(this._lastSelectedCaption=i,qm(i,t));if(n){const e=Hm(n,t);return this._lastSelectedCaption=null,e}return !1}_fixCaptionVisibility(t){return (e,n,i)=>{const o=Um(t(n)),r=this.editor.editing.mapper,s=i.writer;if(o){const t=r.toViewElement(o);t&&(o.childCount?s.removeClass("ck-hidden",t):s.addClass("ck-hidden",t));}}}_insertMissingModelCaptionElement(t){const e=this.editor.model.document.differ.getChanges();for(const n of e)if("insert"==n.type&&"image"==n.name){const e=n.position.nodeAfter;if(!Vm(e))return t.appendElement("caption",e),!0}}}function Fm(t,e=!0){return (n,i,o)=>{const r=i.item;if((r.childCount||e)&&yf(r.parent)){if(!o.consumable.consume(i.item,"insert"))return;const e=o.mapper.toViewElement(i.range.start.parent),n=t(o.writer),s=o.writer;r.childCount||s.addClass("ck-hidden",n),function(t,e,n,i){const o=i.writer.createPositionAt(n,"end");i.writer.insert(o,t),i.mapper.bindElements(e,t);}(n,i.item,e,o);}}}function Um(t){const e=t.getAncestors({includeSelf:!0}).find(t=>"caption"==t.name);return e&&e.parent&&"image"==e.parent.name?e:null}function Hm(t,e){return !t.childCount&&!t.hasClass("ck-hidden")&&(e.addClass("ck-hidden",t),!0)}function qm(t,e){return !!t.hasClass("ck-hidden")&&(e.removeClass("ck-hidden",t),!0)}n(108);class Wm extends jl{constructor(t,e){super(t),this._defaultStyle=!1,this.styles=e.reduce((t,e)=>(t[e.name]=e,e.isDefault&&(this._defaultStyle=e.name),t),{});}refresh(){const t=this.editor.model.document.selection.getSelectedElement();if(this.isEnabled=yf(t),t)if(t.hasAttribute("imageStyle")){const e=t.getAttribute("imageStyle");this.value=!!this.styles[e]&&e;}else this.value=this._defaultStyle;else this.value=!1;}execute(t){const e=t.value,n=this.editor.model,i=n.document.selection.getSelectedElement();n.change(t=>{this.styles[e].isDefault?t.removeAttribute("imageStyle",i):t.setAttribute("imageStyle",e,i);});}}function Ym(t,e){for(const n of e)if(n.name===t)return n}var $m=n(15),Gm=n.n($m),Qm=n(16),Km=n.n(Qm),Jm=n(17),Zm=n.n(Jm),Xm=n(11),tg=n.n(Xm);const eg={full:{name:"full",title:"Full size image",icon:Gm.a,isDefault:!0},side:{name:"side",title:"Side image",icon:tg.a,className:"image-style-side"},alignLeft:{name:"alignLeft",title:"Left aligned image",icon:Km.a,className:"image-style-align-left"},alignCenter:{name:"alignCenter",title:"Centered image",icon:Zm.a,className:"image-style-align-center"},alignRight:{name:"alignRight",title:"Right aligned image",icon:tg.a,className:"image-style-align-right"}},ng={full:Gm.a,left:Km.a,right:tg.a,center:Zm.a};function ig(t=[]){return t.map(og).map(t=>Object.assign({},t))}function og(t){if("string"==typeof t){const e=t;eg[e]?t=Object.assign({},eg[e]):(fs.a.warn("image-style-not-found: There is no such image style of given name.",{name:e}),t={name:e});}else if(eg[t.name]){const e=eg[t.name],n=Object.assign({},t);for(const i in e)t.hasOwnProperty(i)||(n[i]=e[i]);t=n;}return "string"==typeof t.icon&&ng[t.icon]&&(t.icon=ng[t.icon]),t}class rg extends Nl{static get requires(){return [Tf]}static get pluginName(){return "ImageStyleEditing"}init(){const t=this.editor,e=t.model.schema,n=t.data,i=t.editing;t.config.define("image.styles",["full","side"]);const o=ig(t.config.get("image.styles"));e.extend("image",{allowAttributes:"imageStyle"});const r=function(t){return (e,n,i)=>{if(!i.consumable.consume(n.item,e.name))return;const o=Ym(n.attributeNewValue,t),r=Ym(n.attributeOldValue,t),s=i.mapper.toViewElement(n.item),a=i.writer;r&&a.removeClass(r.className,s),o&&a.addClass(o.className,s);}}(o);i.downcastDispatcher.on("attribute:imageStyle:image",r),n.downcastDispatcher.on("attribute:imageStyle:image",r),n.upcastDispatcher.on("element:figure",function(t){const e=t.filter(t=>!t.isDefault);return (t,n,i)=>{if(!n.modelRange)return;const o=n.viewItem,r=Ld(n.modelRange.getItems());if(i.schema.checkAttribute(r,"imageStyle"))for(const t of e)i.consumable.consume(o,{classes:t.className})&&i.writer.setAttribute("imageStyle",t.name,r);}}(o),{priority:"low"}),t.commands.add("imageStyle",new Wm(t,o));}}n(110);class sg extends Nl{get localizedDefaultStylesTitles(){const t=this.editor.t;return {"Full size image":t("af"),"Side image":t("ag"),"Left aligned image":t("ah"),"Centered image":t("ai"),"Right aligned image":t("aj")}}init(){const t=function(t,e){for(const n of t)e[n.title]&&(n.title=e[n.title]);return t}(ig(this.editor.config.get("image.styles")),this.localizedDefaultStylesTitles);for(const e of t)this._createButton(e);}_createButton(t){const e=this.editor,n=`imageStyle:${t.name}`;e.ui.componentFactory.add(n,n=>{const i=e.commands.get("imageStyle"),o=new Sd(n);return o.set({label:t.title,icon:t.icon,tooltip:!0}),o.bind("isEnabled").to(i,"isEnabled"),o.bind("isOn").to(i,"value",e=>e===t.name),this.listenTo(o,"execute",()=>e.execute("imageStyle",{value:t.name})),o});}}class ag extends Nl{static get requires(){return [Qf]}static get pluginName(){return "WidgetToolbarRepository"}init(){const t=this.editor,e=t.plugins.get("BalloonToolbar");e&&this.listenTo(e,"show",e=>{(function(t){const e=t.getSelectedElement();return !(!e||!mf(e))})(t.editing.view.document.selection)&&e.stop();},{priority:"high"}),this._toolbars=new Map,this._balloon=this.editor.plugins.get("ContextualBalloon"),this.listenTo(t.ui,"update",()=>{this._updateToolbarsVisibility();}),this.listenTo(t.ui.focusTracker,"change:isFocused",()=>{this._updateToolbarsVisibility();},{priority:"low"});}register(t,{items:e,visibleWhen:n,balloonClassName:i="ck-toolbar-container"}){const o=this.editor,r=new Sl;if(this._toolbars.has(t))throw new P.b("widget-toolbar-duplicated: Toolbar with the given id was already added.",{toolbarId:t});r.fillFromConfig(e,o.ui.componentFactory),this._toolbars.set(t,{view:r,visibleWhen:n,balloonClassName:i});}_updateToolbarsVisibility(){for(const t of this._toolbars.values())this.editor.ui.focusTracker.isFocused&&t.visibleWhen(this.editor.editing.view.document.selection)?this._showToolbar(t):this._hideToolbar(t);}_hideToolbar(t){this._isToolbarVisible(t)&&this._balloon.remove(t.view);}_showToolbar(t){this._isToolbarVisible(t)?function(t){const e=t.plugins.get("ContextualBalloon"),n=cg(t);e.updatePosition(n);}(this.editor):this._balloon.hasView(t.view)||this._balloon.add({view:t.view,position:cg(this.editor),balloonClassName:t.balloonClassName});}_isToolbarVisible(t){return this._balloon.visibleView==t.view}}function cg(t){const e=t.editing.view,n=Wf.defaultPositions,i=function(t){const e=t.getSelectedElement();if(e&&mf(e))return e;let n=t.getFirstPosition().parent;for(;n;){if(n.is("element")&&mf(n))return n;n=n.parent;}}(e.document.selection);return {target:e.domConverter.viewToDom(i),positions:[n.northArrowSouth,n.northArrowSouthWest,n.northArrowSouthEast,n.southArrowNorth,n.southArrowNorthWest,n.southArrowNorthEast]}}function lg(t,e,n){return n.createRange(dg(t,e,!0,n),dg(t,e,!1,n))}function dg(t,e,n,i){let o=t.textNode||(n?t.nodeBefore:t.nodeAfter),r=null;for(;o&&o.getAttribute("linkHref")==e;)r=o,o=n?o.previousSibling:o.nextSibling;return r?i.createPositionAt(r,n?"before":"after"):t}class ug extends jl{refresh(){const t=this.editor.model,e=t.document;this.value=e.selection.getAttribute("linkHref"),this.isEnabled=t.schema.checkAttributeInSelection(e.selection,"linkHref");}execute(t){const e=this.editor.model,n=e.document.selection;e.change(i=>{if(n.isCollapsed){const o=n.getFirstPosition();if(n.hasAttribute("linkHref")){const o=lg(n.getFirstPosition(),n.getAttribute("linkHref"),e);i.setAttribute("linkHref",t,o),i.setSelection(o);}else if(""!==t){const e=Rs(n.getAttributes());e.set("linkHref",t);const r=i.createText(t,e);i.insert(r,o),i.setSelection(i.createRangeOn(r));}}else{const o=e.schema.getValidRanges(n.getRanges(),"linkHref");for(const e of o)i.setAttribute("linkHref",t,e);}});}}class hg extends jl{refresh(){this.isEnabled=this.editor.model.document.selection.hasAttribute("linkHref");}execute(){const t=this.editor.model,e=t.document.selection;t.change(n=>{const i=e.isCollapsed?[lg(e.getFirstPosition(),e.getAttribute("linkHref"),t)]:e.getRanges();for(const t of i)n.removeAttribute("linkHref",t);});}}const fg=Symbol("linkElement"),mg=/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205f\u3000]/g,gg=/^(?:(?:https?|ftps?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i;function pg(t,e){const n=e.createAttributeElement("a",{href:t},{priority:5});return e.setCustomProperty(fg,!0,n),n}function bg(t){return function(t){return t.replace(mg,"").match(gg)}(t=String(t))?t:"#"}class wg{constructor(t,e,n){this.model=t,this.attribute=n,this._modelSelection=t.document.selection,this._overrideUid=null,this._isNextGravityRestorationSkipped=!1,e.listenTo(this._modelSelection,"change:range",(t,e)=>{this._isNextGravityRestorationSkipped?this._isNextGravityRestorationSkipped=!1:this._isGravityOverridden&&(!e.directChange&&_g(this._modelSelection.getFirstPosition(),n)||this._restoreGravity());});}handleForwardMovement(t,e){const n=this.attribute;if(!(this._isGravityOverridden||t.isAtStart&&this._hasSelectionAttribute))return yg(t,n)&&this._hasSelectionAttribute?(this._preventCaretMovement(e),this._removeSelectionAttribute(),!0):kg(t,n)?(this._preventCaretMovement(e),this._overrideGravity(),!0):vg(t,n)&&this._hasSelectionAttribute?(this._preventCaretMovement(e),this._overrideGravity(),!0):void 0}handleBackwardMovement(t,e){const n=this.attribute;return this._isGravityOverridden?yg(t,n)&&this._hasSelectionAttribute?(this._preventCaretMovement(e),this._restoreGravity(),this._removeSelectionAttribute(),!0):(this._preventCaretMovement(e),this._restoreGravity(),t.isAtStart&&this._removeSelectionAttribute(),!0):yg(t,n)&&!this._hasSelectionAttribute?(this._preventCaretMovement(e),this._setSelectionAttributeFromTheNodeBefore(t),!0):t.isAtEnd&&vg(t,n)?this._hasSelectionAttribute?void(xg(t,n)&&(this._skipNextAutomaticGravityRestoration(),this._overrideGravity())):(this._preventCaretMovement(e),this._setSelectionAttributeFromTheNodeBefore(t),!0):t.isAtStart?this._hasSelectionAttribute?(this._removeSelectionAttribute(),this._preventCaretMovement(e),!0):void 0:void(xg(t,n)&&(this._skipNextAutomaticGravityRestoration(),this._overrideGravity()))}get _isGravityOverridden(){return !!this._overrideUid}get _hasSelectionAttribute(){return this._modelSelection.hasAttribute(this.attribute)}_overrideGravity(){this._overrideUid=this.model.change(t=>t.overrideSelectionGravity());}_restoreGravity(){this.model.change(t=>{t.restoreSelectionGravity(this._overrideUid),this._overrideUid=null;});}_preventCaretMovement(t){t.preventDefault();}_removeSelectionAttribute(){this.model.change(t=>{t.removeSelectionAttribute(this.attribute);});}_setSelectionAttributeFromTheNodeBefore(t){const e=this.attribute;this.model.change(n=>{n.setSelectionAttribute(this.attribute,t.nodeBefore.getAttribute(e));});}_skipNextAutomaticGravityRestoration(){this._isNextGravityRestorationSkipped=!0;}}function _g(t,e){return kg(t,e)||vg(t,e)}function kg(t,e){const{nodeBefore:n,nodeAfter:i}=t,o=!!n&&n.hasAttribute(e);return !!i&&i.hasAttribute(e)&&(!o||n.getAttribute(e)!==i.getAttribute(e))}function vg(t,e){const{nodeBefore:n,nodeAfter:i}=t,o=!!n&&n.hasAttribute(e),r=!!i&&i.hasAttribute(e);return o&&(!r||n.getAttribute(e)!==i.getAttribute(e))}function yg(t,e){const{nodeBefore:n,nodeAfter:i}=t,o=!!n&&n.hasAttribute(e);if(!!i&&i.hasAttribute(e)&&o)return i.getAttribute(e)!==n.getAttribute(e)}function xg(t,e){return _g(t.getShiftedBy(-1),e)}n(112);const Ag="ck-link_selected";class Cg extends Nl{init(){const t=this.editor;t.model.schema.extend("$text",{allowAttributes:"linkHref"}),t.conversion.for("dataDowncast").add(ca({model:"linkHref",view:pg})),t.conversion.for("editingDowncast").add(ca({model:"linkHref",view:(t,e)=>pg(bg(t),e)})),t.conversion.for("upcast").add(Ra({view:{name:"a",attributes:{href:!0}},model:{key:"linkHref",value:t=>t.getAttribute("href")}})),t.commands.add("link",new ug(t)),t.commands.add("unlink",new hg(t)),function(t,e,n,i){const o=new wg(e,n,i),r=e.document.selection;n.listenTo(t.document,"keydown",(t,e)=>{if(!r.isCollapsed)return;if(e.shiftKey||e.altKey||e.ctrlKey)return;const n=e.keyCode==ho.arrowright,i=e.keyCode==ho.arrowleft;if(!n&&!i)return;const s=r.getFirstPosition();let a;(a=n?o.handleForwardMovement(s,e):o.handleBackwardMovement(s,e))&&t.stop();},{priority:E.get("high")+1});}(t.editing.view,t.model,this,"linkHref"),this._setupLinkHighlight();}_setupLinkHighlight(){const t=this.editor,e=t.editing.view,n=new Set;e.document.registerPostFixer(e=>{const i=t.model.document.selection;if(i.hasAttribute("linkHref")){const o=lg(i.getFirstPosition(),i.getAttribute("linkHref"),t.model),r=t.editing.mapper.toViewRange(o);for(const t of r.getItems())t.is("a")&&(e.addClass(Ag,t),n.add(t));}}),t.conversion.for("editingDowncast").add(t=>{function i(){e.change(t=>{for(const e of n.values())t.removeClass(Ag,e),n.delete(e);});}t.on("insert",i,{priority:"highest"}),t.on("remove",i,{priority:"highest"}),t.on("attribute",i,{priority:"highest"}),t.on("selection",i,{priority:"highest"});});}}class Tg extends Kr{constructor(t){super(t),this.domEventType="click";}onDomEvent(t){this.fire(t.type,t);}}n(114);class Pg extends yl{constructor(t){super(t);const e=t.t;this.focusTracker=new Kc,this.keystrokes=new Uc,this.urlInputView=this._createUrlInput(),this.saveButtonView=this._createButton(e("br"),zf.a,"ck-button-save"),this.saveButtonView.type="submit",this.cancelButtonView=this._createButton(e("bs"),Ff.a,"ck-button-cancel","cancel"),this._focusables=new Xc,this._focusCycler=new Tl({focusables:this._focusables,focusTracker:this.focusTracker,keystrokeHandler:this.keystrokes,actions:{focusPrevious:"shift + tab",focusNext:"tab"}}),this.setTemplate({tag:"form",attributes:{class:["ck","ck-link-form"],tabindex:"-1"},children:[this.urlInputView,this.saveButtonView,this.cancelButtonView]});}render(){super.render(),jf({view:this}),[this.urlInputView,this.saveButtonView,this.cancelButtonView].forEach(t=>{this._focusables.add(t),this.focusTracker.add(t.element);}),this.keystrokes.listenTo(this.element);}focus(){this._focusCycler.focusFirst();}_createUrlInput(){const t=this.locale.t,e=new Df(this.locale,Lf);return e.label=t("cc"),e.inputView.placeholder="https://example.com",e}_createButton(t,e,n,i){const o=new Sd(this.locale);return o.set({label:t,icon:e,tooltip:!0}),o.extendTemplate({attributes:{class:n}}),i&&o.delegate("execute").to(this,i),o}}var Mg=n(42),Sg=n.n(Mg),Ig=n(43),Eg=n.n(Ig);n(116);class Ng extends yl{constructor(t){super(t);const e=t.t;this.focusTracker=new Kc,this.keystrokes=new Uc,this.previewButtonView=this._createPreviewButton(),this.unlinkButtonView=this._createButton(e("by"),Sg.a,"unlink"),this.editButtonView=this._createButton(e("bz"),Eg.a,"edit"),this.set("href"),this._focusables=new Xc,this._focusCycler=new Tl({focusables:this._focusables,focusTracker:this.focusTracker,keystrokeHandler:this.keystrokes,actions:{focusPrevious:"shift + tab",focusNext:"tab"}}),this.setTemplate({tag:"div",attributes:{class:["ck","ck-link-actions"],tabindex:"-1"},children:[this.previewButtonView,this.editButtonView,this.unlinkButtonView]});}render(){super.render(),[this.previewButtonView,this.editButtonView,this.unlinkButtonView].forEach(t=>{this._focusables.add(t),this.focusTracker.add(t.element);}),this.keystrokes.listenTo(this.element);}focus(){this._focusCycler.focusFirst();}_createButton(t,e,n){const i=new Sd(this.locale);return i.set({label:t,icon:e,tooltip:!0}),i.delegate("execute").to(this,n),i}_createPreviewButton(){const t=new Sd(this.locale),e=this.bindTemplate,n=this.t;return t.set({withText:!0,tooltip:n("ca")}),t.extendTemplate({attributes:{class:["ck","ck-link-actions__preview"],href:e.to("href",t=>t&&bg(t)),target:"_blank"}}),t.bind("label").to(this,"href",t=>t||n("cb")),t.bind("isEnabled").to(this,"href",t=>!!t),t.template.tag="a",t.template.eventListeners={},t}}var Og=n(44),Rg=n.n(Og);const Dg="Ctrl+K";class Lg extends Nl{static get requires(){return [Qf]}init(){const t=this.editor;t.editing.view.addObserver(Tg),this.actionsView=this._createActionsView(),this.formView=this._createFormView(),this._balloon=t.plugins.get(Qf),this._createToolbarLinkButton(),this._enableUserBalloonInteractions();}_createActionsView(){const t=this.editor,e=new Ng(t.locale),n=t.commands.get("link"),i=t.commands.get("unlink");return e.bind("href").to(n,"value"),e.editButtonView.bind("isEnabled").to(n),e.unlinkButtonView.bind("isEnabled").to(i),this.listenTo(e,"edit",()=>{this._addFormView();}),this.listenTo(e,"unlink",()=>{t.execute("unlink"),this._hideUI();}),e.keystrokes.set("Esc",(t,e)=>{this._hideUI(),e();}),e.keystrokes.set(Dg,(t,e)=>{this._addFormView(),e();}),e}_createFormView(){const t=this.editor,e=new Pg(t.locale),n=t.commands.get("link");return e.urlInputView.bind("value").to(n,"value"),e.urlInputView.bind("isReadOnly").to(n,"isEnabled",t=>!t),e.saveButtonView.bind("isEnabled").to(n),this.listenTo(e,"submit",()=>{t.execute("link",e.urlInputView.inputView.element.value),this._removeFormView();}),this.listenTo(e,"cancel",()=>{this._removeFormView();}),e.keystrokes.set("Esc",(t,e)=>{this._removeFormView(),e();}),e}_createToolbarLinkButton(){const t=this.editor,e=t.commands.get("link"),n=t.t;t.keystrokes.set(Dg,(t,n)=>{n(),e.isEnabled&&this._showUI();}),t.ui.componentFactory.add("link",t=>{const i=new Sd(t);return i.isEnabled=!0,i.label=n("bf"),i.icon=Rg.a,i.keystroke=Dg,i.tooltip=!0,i.bind("isOn","isEnabled").to(e,"value","isEnabled"),this.listenTo(i,"execute",()=>this._showUI()),i});}_enableUserBalloonInteractions(){const t=this.editor.editing.view.document;this.listenTo(t,"click",()=>{this._getSelectedLinkElement()&&this._showUI();}),this.editor.keystrokes.set("Tab",(t,e)=>{this._areActionsVisible&&!this.actionsView.focusTracker.isFocused&&(this.actionsView.focus(),e());},{priority:"high"}),this.editor.keystrokes.set("Esc",(t,e)=>{this._isUIVisible&&(this._hideUI(),e());}),eu({emitter:this.formView,activator:()=>this._isUIVisible,contextElements:[this._balloon.view.element],callback:()=>this._hideUI()});}_addActionsView(){this._areActionsInPanel||this._balloon.add({view:this.actionsView,position:this._getBalloonPositionData()});}_addFormView(){if(this._isFormInPanel)return;const t=this.editor.commands.get("link");this._balloon.add({view:this.formView,position:this._getBalloonPositionData()}),this.formView.urlInputView.select(),this.formView.urlInputView.inputView.element.value=t.value||"";}_removeFormView(){this._isFormInPanel&&(this._balloon.remove(this.formView),this.editor.editing.view.focus());}_showUI(){this.editor.commands.get("link").isEnabled&&(this._getSelectedLinkElement()?this._areActionsVisible?this._addFormView():this._addActionsView():(this._addActionsView(),this._addFormView()),this._startUpdatingUI());}_hideUI(){if(!this._isUIInPanel)return;const t=this.editor;this.stopListening(t.ui,"update"),this._removeFormView(),this._balloon.remove(this.actionsView),t.editing.view.focus();}_startUpdatingUI(){const t=this.editor,e=t.editing.view.document;let n=this._getSelectedLinkElement(),i=o();function o(){return e.selection.focus.getAncestors().reverse().find(t=>t.is("element"))}this.listenTo(t.ui,"update",()=>{const t=this._getSelectedLinkElement(),e=o();n&&!t||!n&&e!==i?this._hideUI():this._balloon.updatePosition(this._getBalloonPositionData()),n=t,i=e;});}get _isFormInPanel(){return this._balloon.hasView(this.formView)}get _areActionsInPanel(){return this._balloon.hasView(this.actionsView)}get _areActionsVisible(){return this._balloon.visibleView===this.actionsView}get _isUIInPanel(){return this._isFormInPanel||this._areActionsInPanel}get _isUIVisible(){return this._balloon.visibleView==this.formView||this._areActionsVisible}_getBalloonPositionData(){const t=this.editor.editing.view,e=t.document,n=this._getSelectedLinkElement();return {target:n?t.domConverter.mapViewToDom(n):t.domConverter.viewRangeToDom(e.selection.getFirstRange())}}_getSelectedLinkElement(){const t=this.editor.editing.view,e=t.document.selection;if(e.isCollapsed)return jg(e.getFirstPosition());{const n=e.getFirstRange().getTrimmed(),i=jg(n.start),o=jg(n.end);return i&&i==o&&t.createRangeIn(i).getTrimmed().isEqual(n)?i:null}}}function jg(t){return t.getAncestors().find(t=>(function(t){return t.is("attributeElement")&&!!t.getCustomProperty(fg)})(t))}class Vg extends jl{constructor(t,e){super(t),this.type="bulleted"==e?"bulleted":"numbered";}refresh(){this.value=this._getValue(),this.isEnabled=this._checkEnabled();}execute(){const t=this.editor.model,e=t.document,n=Array.from(e.selection.getSelectedBlocks()).filter(e=>Bg(e,t.schema)),i=!0===this.value;t.change(t=>{if(i){let e=n[n.length-1].nextSibling,i=Number.POSITIVE_INFINITY,o=[];for(;e&&"listItem"==e.name&&0!==e.getAttribute("listIndent");){const t=e.getAttribute("listIndent");t<i&&(i=t);const n=t-i;o.push({element:e,listIndent:n}),e=e.nextSibling;}o=o.reverse();for(const e of o)t.setAttribute("listIndent",e.listIndent,e.element);}if(!i){let t=Number.POSITIVE_INFINITY;for(const e of n)e.is("listItem")&&e.getAttribute("listIndent")<t&&(t=e.getAttribute("listIndent"));zg(n,!0,t=0===t?1:t),zg(n,!1,t);}for(const e of n.reverse())i&&"listItem"==e.name?t.rename(e,"paragraph"):i||"listItem"==e.name?i||"listItem"!=e.name||e.getAttribute("listType")==this.type||t.setAttribute("listType",this.type,e):(t.setAttributes({listType:this.type,listIndent:0},e),t.rename(e,"listItem"));});}_getValue(){const t=Ld(this.editor.model.document.selection.getSelectedBlocks());return !!t&&t.is("listItem")&&t.getAttribute("listType")==this.type}_checkEnabled(){if(this.value)return !0;const t=this.editor.model.document.selection,e=this.editor.model.schema,n=Ld(t.getSelectedBlocks());return !!n&&Bg(n,e)}}function zg(t,e,n){const i=e?t[0]:t[t.length-1];if(i.is("listItem")){let o=i[e?"previousSibling":"nextSibling"],r=i.getAttribute("listIndent");for(;o&&o.is("listItem")&&o.getAttribute("listIndent")>=n;)r>o.getAttribute("listIndent")&&(r=o.getAttribute("listIndent")),o.getAttribute("listIndent")==r&&t[e?"unshift":"push"](o),o=o[e?"previousSibling":"nextSibling"];}}function Bg(t,e){return e.checkChild(t.parent,"listItem")&&!e.isObject(t)}class Fg extends jl{constructor(t,e){super(t),this._indentBy="forward"==e?1:-1;}refresh(){this.isEnabled=this._checkEnabled();}execute(){const t=this.editor.model,e=t.document;let n=Array.from(e.selection.getSelectedBlocks());t.change(t=>{const e=n[n.length-1];let i=e.nextSibling;for(;i&&"listItem"==i.name&&i.getAttribute("listIndent")>e.getAttribute("listIndent");)n.push(i),i=i.nextSibling;this._indentBy<0&&(n=n.reverse());for(const e of n){const n=e.getAttribute("listIndent")+this._indentBy;n<0?t.rename(e,"paragraph"):t.setAttribute("listIndent",n,e);}});}_checkEnabled(){const t=Ld(this.editor.model.document.selection.getSelectedBlocks());if(!t||!t.is("listItem"))return !1;if(this._indentBy>0){const e=t.getAttribute("listIndent"),n=t.getAttribute("listType");let i=t.previousSibling;for(;i&&i.is("listItem")&&i.getAttribute("listIndent")>=e;){if(i.getAttribute("listIndent")==e)return i.getAttribute("listType")==n;i=i.previousSibling;}return !1}return !0}}function Ug(){const t=!this.isEmpty&&("ul"==this.getChild(0).name||"ol"==this.getChild(0).name);return this.isEmpty||t?0:wi.call(this)}function Hg(t){return (e,n,i)=>{const o=i.consumable;if(!o.test(n.item,"insert")||!o.test(n.item,"attribute:listType")||!o.test(n.item,"attribute:listIndent"))return;o.consume(n.item,"insert"),o.consume(n.item,"attribute:listType"),o.consume(n.item,"attribute:listIndent");const r=n.item;np(r,function(t,e){const n=e.mapper,i=e.writer,o="numbered"==t.getAttribute("listType")?"ol":"ul",r=function(t){const e=t.createContainerElement("li");return e.getFillerOffset=Ug,e}(i),s=i.createContainerElement(o,null);return i.insert(i.createPositionAt(s,0),r),n.bindElements(t,r),r}(r,i),i,t);}}function qg(t){return (e,n,i)=>{const o=i.mapper.toViewPosition(n.position).getLastMatchingPosition(t=>!t.item.is("li")).nodeAfter,r=i.writer;r.breakContainer(r.createPositionBefore(o)),r.breakContainer(r.createPositionAfter(o));const s=o.parent,a=s.previousSibling,c=r.createRangeOn(s),l=r.remove(c);a&&a.nextSibling&&ep(r,a,a.nextSibling),ip(i.mapper.toModelElement(o).getAttribute("listIndent")+1,n.position,c.start,o,i,t);for(const t of r.createRangeIn(l).getItems())i.mapper.unbindViewElement(t);e.stop();}}function Wg(t,e,n){if(!n.consumable.consume(e.item,"attribute:listType"))return;const i=n.mapper.toViewElement(e.item),o=n.writer;o.breakContainer(o.createPositionBefore(i)),o.breakContainer(o.createPositionAfter(i));let r=i.parent;const s="numbered"==e.attributeNewValue?"ol":"ul";ep(o,r=o.rename(s,r),r.nextSibling),ep(o,r.previousSibling,r);for(const t of e.item.getChildren())n.consumable.consume(t,"insert");}function Yg(t){return (e,n,i)=>{if(!i.consumable.consume(n.item,"attribute:listIndent"))return;const o=i.mapper.toViewElement(n.item),r=i.writer;r.breakContainer(r.createPositionBefore(o)),r.breakContainer(r.createPositionAfter(o));const s=o.parent,a=s.previousSibling,c=r.createRangeOn(s);r.remove(c),a&&a.nextSibling&&ep(r,a,a.nextSibling),ip(n.attributeOldValue+1,n.range.start,c.start,o,i,t),np(n.item,o,i,t);for(const t of n.item.getChildren())i.consumable.consume(t,"insert");}}function $g(t,e,n){if("listItem"!=e.item.name){let t=n.mapper.toViewPosition(e.range.start);const i=n.writer,o=[];for(;("ul"==t.parent.name||"ol"==t.parent.name)&&"li"==(t=i.breakContainer(t)).parent.name;){const e=t,n=i.createPositionAt(t.parent,"end");if(!e.isEqual(n)){const t=i.remove(i.createRange(e,n));o.push(t);}t=i.createPositionAfter(t.parent);}if(o.length>0){for(let e=0;e<o.length;e++){const n=t.nodeBefore;if(t=i.insert(t,o[e]).end,e>0){const e=ep(i,n,n.nextSibling);e&&e.parent==n&&t.offset--;}}ep(i,t.nodeBefore,t.nodeAfter);}}}function Gg(t,e,n){const i=n.mapper.toViewPosition(e.position),o=i.nodeBefore,r=i.nodeAfter;ep(n.writer,o,r);}function Qg(t,e,n){if(n.consumable.consume(e.viewItem,{name:!0})){const t=n.writer,i=this.conversionApi.store,o=t.createElement("listItem");i.indent=i.indent||0,t.setAttribute("listIndent",i.indent,o);const r=e.viewItem.parent&&"ol"==e.viewItem.parent.name?"numbered":"bulleted";t.setAttribute("listType",r,o),i.indent++;const s=n.splitToAllowedParent(o,e.modelCursor);if(!s)return;t.insert(o,s.position);const a=function(t,e,n){const i=n.writer;let o=t,r=i.createPositionAfter(t);for(const t of e)if("ul"==t.name||"ol"==t.name)r=n.convertItem(t,r).modelCursor;else{const e=n.convertItem(t,i.createPositionAt(o,"end")),s=e.modelRange.start.nodeAfter;r=e.modelCursor,s&&s.is("element")&&!n.schema.checkChild(o,s.name)&&!(o=r.parent).is("listItem")&&o.nextSibling&&o.nextSibling.is("listItem")&&(o=o.nextSibling,r=i.createPositionAt(o,"end"));}return r}(o,e.viewItem.getChildren(),n);i.indent--,e.modelRange=t.createRange(e.modelCursor,a),s.cursorParent?e.modelCursor=t.createPositionAt(s.cursorParent,0):e.modelCursor=e.modelRange.end;}}function Kg(t,e,n){if(n.consumable.test(e.viewItem,{name:!0})){const t=Array.from(e.viewItem.getChildren());for(const e of t)e.is("li")||e._remove();}}function Jg(t,e,n){if(n.consumable.test(e.viewItem,{name:!0})){if(0===e.viewItem.childCount)return;const t=[...e.viewItem.getChildren()];let n=!1,i=!0;for(const e of t)!n||e.is("ul")||e.is("ol")||e._remove(),e.is("text")?(i&&(e._data=e.data.replace(/^\s+/,"")),(!e.nextSibling||e.nextSibling.is("ul")||e.nextSibling.is("ol"))&&(e._data=e.data.replace(/\s+$/,""))):(e.is("ul")||e.is("ol"))&&(n=!0),i=!1;}}function Zg(t){return (e,n)=>{if(n.isPhantom)return;const i=n.modelPosition.nodeBefore;if(i&&i.is("listItem")){const e=n.mapper.toViewElement(i),o=e.getAncestors().find(t=>t.is("ul")||t.is("ol")),r=t.createPositionAt(e,0).getWalker();for(const t of r){if("elementStart"==t.type&&t.item.is("li")){n.viewPosition=t.previousPosition;break}if("elementEnd"==t.type&&t.item==o){n.viewPosition=t.nextPosition;break}}}}}function Xg(t,[e,n]){let i,o=e.is("documentFragment")?e.getChild(0):e;if(i=n?this.createSelection(n):this.document.selection,o&&o.is("listItem")){const t=i.getFirstPosition();let e=null;if(t.parent.is("listItem")?e=t.parent:t.nodeBefore&&t.nodeBefore.is("listItem")&&(e=t.nodeBefore),e){const t=e.getAttribute("listIndent");if(t>0)for(;o&&o.is("listItem");)o._setAttribute("listIndent",o.getAttribute("listIndent")+t),o=o.nextSibling;}}}function tp(t,e){const n=!!e.sameIndent,i=!!e.smallerIndent,o=e.listIndent;let r=t;for(;r&&"listItem"==r.name;){const t=r.getAttribute("listIndent");if(n&&o==t||i&&o>t)return r;r=r.previousSibling;}return null}function ep(t,e,n){return e&&n&&("ul"==e.name||"ol"==e.name)&&e.name==n.name?t.mergeContainers(t.createPositionAfter(e)):null}function np(t,e,n,i){const o=e.parent,r=n.mapper,s=n.writer;let a=r.toViewPosition(i.createPositionBefore(t));const c=tp(t.previousSibling,{sameIndent:!0,smallerIndent:!0,listIndent:t.getAttribute("listIndent")}),l=t.previousSibling;if(c&&c.getAttribute("listIndent")==t.getAttribute("listIndent")){const t=r.toViewElement(c);a=s.breakContainer(s.createPositionAfter(t));}else a=l&&"listItem"==l.name?r.toViewPosition(i.createPositionAt(l,"end")):r.toViewPosition(i.createPositionBefore(t));if(a=op(a),s.insert(a,o),l&&"listItem"==l.name){const t=r.toViewElement(l),n=s.createRange(s.createPositionAt(t,0),a).getWalker({ignoreElementEnd:!0});for(const t of n)if(t.item.is("li")){const i=s.breakContainer(s.createPositionBefore(t.item)),o=t.item.parent,r=s.createPositionAt(e,"end");ep(s,r.nodeBefore,r.nodeAfter),s.move(s.createRangeOn(o),r),n.position=i;}}else{const n=o.nextSibling;if(n&&(n.is("ul")||n.is("ol"))){let i=null;for(const e of n.getChildren()){const n=r.toModelElement(e);if(!(n&&n.getAttribute("listIndent")>t.getAttribute("listIndent")))break;i=e;}i&&(s.breakContainer(s.createPositionAfter(i)),s.move(s.createRangeOn(i.parent),s.createPositionAt(e,"end")));}}ep(s,o,o.nextSibling),ep(s,o.previousSibling,o);}function ip(t,e,n,i,o,r){const s=tp(e.nodeBefore,{sameIndent:!0,smallerIndent:!0,listIndent:t,foo:"b"}),a=o.mapper,c=o.writer,l=s?s.getAttribute("listIndent"):null;let d;if(s)if(l==t){const t=a.toViewElement(s).parent;d=c.createPositionAfter(t);}else{const t=r.createPositionAt(s,"end");d=a.toViewPosition(t);}else d=n;d=op(d);for(const t of[...i.getChildren()])(t.is("ul")||t.is("ol"))&&(d=c.move(c.createRangeOn(t),d).end,ep(c,t,t.nextSibling),ep(c,t.previousSibling,t));}function op(t){return t.getLastMatchingPosition(t=>t.item.is("uiElement"))}class rp extends Nl{static get requires(){return [Tm]}init(){const t=this.editor;t.model.schema.register("listItem",{inheritAllFrom:"$block",allowAttributes:["listType","listIndent"]});const e=t.data,n=t.editing;t.model.document.registerPostFixer(e=>(function(t,e){const n=t.document.differ.getChanges(),i=new Map;let o=!1;for(const t of n)if("insert"==t.type&&"listItem"==t.name)r(t.position);else if("insert"==t.type&&"listItem"!=t.name){if("$text"!=t.name){const n=t.position.nodeAfter;n.hasAttribute("listIndent")&&(e.removeAttribute("listIndent",n),o=!0),n.hasAttribute("listType")&&(e.removeAttribute("listType",n),o=!0);}r(t.position.getShiftedBy(t.length));}else"remove"==t.type&&"listItem"==t.name?r(t.position):"attribute"==t.type&&"listIndent"==t.attributeKey?r(t.range.start):"attribute"==t.type&&"listType"==t.attributeKey&&r(t.range.start);for(const t of i.values())s(t),a(t);return o;function r(t){const e=t.nodeBefore;if(e&&e.is("listItem")){let n=e;if(i.has(n))return;for(;n.previousSibling&&n.previousSibling.is("listItem");)if(n=n.previousSibling,i.has(n))return;i.set(t.nodeBefore,n);}else{const e=t.nodeAfter;e&&e.is("listItem")&&i.set(e,e);}}function s(t){let n=0,i=null;for(;t&&t.is("listItem");){const r=t.getAttribute("listIndent");if(r>n){let s;null===i?(i=r-n,s=n):(i>r&&(i=r),s=r-i),e.setAttribute("listIndent",s,t),o=!0;}else i=null,n=t.getAttribute("listIndent")+1;t=t.nextSibling;}}function a(t){let n=[],i=null;for(;t&&t.is("listItem");){const r=t.getAttribute("listIndent");if(i&&i.getAttribute("listIndent")>r&&(n=n.slice(0,r+1)),0!=r)if(n[r]){const i=n[r];t.getAttribute("listType")!=i&&(e.setAttribute("listType",i,t),o=!0);}else n[r]=t.getAttribute("listType");i=t,t=t.nextSibling;}}})(t.model,e)),n.mapper.registerViewToModelLength("li",sp),e.mapper.registerViewToModelLength("li",sp),n.mapper.on("modelToViewPosition",Zg(n.view)),n.mapper.on("viewToModelPosition",function(t){return (e,n)=>{const i=n.viewPosition,o=i.parent,r=n.mapper;if("ul"==o.name||"ol"==o.name){if(i.isAtEnd){const e=r.toModelElement(i.nodeBefore),o=r.getModelLength(i.nodeBefore);n.modelPosition=t.createPositionBefore(e).getShiftedBy(o);}else{const e=r.toModelElement(i.nodeAfter);n.modelPosition=t.createPositionBefore(e);}e.stop();}else if("li"==o.name&&i.nodeBefore&&("ul"==i.nodeBefore.name||"ol"==i.nodeBefore.name)){const s=r.toModelElement(o);let a=1,c=i.nodeBefore;for(;c&&(c.is("ul")||c.is("ol"));)a+=r.getModelLength(c),c=c.previousSibling;n.modelPosition=t.createPositionBefore(s).getShiftedBy(a),e.stop();}}}(t.model)),e.mapper.on("modelToViewPosition",Zg(n.view)),n.downcastDispatcher.on("insert",$g,{priority:"high"}),n.downcastDispatcher.on("insert:listItem",Hg(t.model)),e.downcastDispatcher.on("insert",$g,{priority:"high"}),e.downcastDispatcher.on("insert:listItem",Hg(t.model)),n.downcastDispatcher.on("attribute:listType:listItem",Wg),e.downcastDispatcher.on("attribute:listType:listItem",Wg),n.downcastDispatcher.on("attribute:listIndent:listItem",Yg(t.model)),e.downcastDispatcher.on("attribute:listIndent:listItem",Yg(t.model)),n.downcastDispatcher.on("remove:listItem",qg(t.model)),n.downcastDispatcher.on("remove",Gg,{priority:"low"}),e.downcastDispatcher.on("remove:listItem",qg(t.model)),e.downcastDispatcher.on("remove",Gg,{priority:"low"}),e.upcastDispatcher.on("element:ul",Kg,{priority:"high"}),e.upcastDispatcher.on("element:ol",Kg,{priority:"high"}),e.upcastDispatcher.on("element:li",Jg,{priority:"high"}),e.upcastDispatcher.on("element:li",Qg),t.model.on("insertContent",Xg,{priority:"high"}),t.commands.add("numberedList",new Vg(t,"numbered")),t.commands.add("bulletedList",new Vg(t,"bulleted")),t.commands.add("indentList",new Fg(t,"forward")),t.commands.add("outdentList",new Fg(t,"backward"));const i=this.editor.editing.view.document;this.listenTo(i,"enter",(t,e)=>{const n=this.editor.model.document,i=n.selection.getLastPosition().parent;n.selection.isCollapsed&&"listItem"==i.name&&i.isEmpty&&(this.editor.execute("outdentList"),e.preventDefault(),t.stop());}),this.listenTo(i,"delete",(t,e)=>{if("backward"!==e.direction)return;const n=this.editor.model.document.selection;if(!n.isCollapsed)return;const i=n.getFirstPosition();if(!i.isAtStart)return;const o=i.parent;"listItem"===o.name&&(o.previousSibling&&"listItem"===o.previousSibling.name||(this.editor.execute("outdentList"),e.preventDefault(),t.stop()));},{priority:"high"});const o=t=>(e,n)=>{this.editor.commands.get(t).isEnabled&&(this.editor.execute(t),n());};this.editor.keystrokes.set("Tab",o("indentList")),this.editor.keystrokes.set("Shift+Tab",o("outdentList"));}}function sp(t){let e=1;for(const n of t.getChildren())if("ul"==n.name||"ol"==n.name)for(const t of n.getChildren())e+=sp(t);return e}var ap=n(45),cp=n.n(ap),lp=n(46),dp=n.n(lp);class up extends Nl{init(){const t=this.editor.t;this._addButton("numberedList",t("ak"),cp.a),this._addButton("bulletedList",t("al"),dp.a);}_addButton(t,e,n){const i=this.editor;i.ui.componentFactory.add(t,o=>{const r=i.commands.get(t),s=new Sd(o);return s.set({label:e,icon:n,tooltip:!0}),s.bind("isOn","isEnabled").to(r,"value","isEnabled"),this.listenTo(s,"execute",()=>i.execute(t)),s});}}function hp(t,e){return t=>{t.on("attribute:url:media",n);};function n(n,i,o){if(!o.consumable.consume(i.item,n.name))return;const r=i.attributeNewValue,s=o.writer,a=o.mapper.toViewElement(i.item);s.remove(s.createRangeIn(a));const c=t.getMediaViewElement(s,r,e);s.insert(s.createPositionAt(a,0),c);}}const fp=Symbol("isMedia");function mp(t,e,n,i){const o=t.createContainerElement("figure",{class:"media"});return o.getFillerOffset=pp,t.insert(t.createPositionAt(o,0),e.getMediaViewElement(t,n,i)),o}function gp(t){const e=t.getSelectedElement();return e&&e.is("media")?e:null}function pp(){return null}class bp extends jl{refresh(){const t=this.editor.model,e=t.document.selection,n=t.schema,i=e.getFirstPosition(),o=gp(e);let r=i.parent;r!=r.root&&(r=r.parent),this.value=o?o.getAttribute("url"):null,this.isEnabled=n.checkChild(r,"media");}execute(t){const e=this.editor.model,n=e.document.selection,i=gp(n);if(i)e.change(e=>{e.setAttribute("url",t,i);});else{const i=wf(n,e);e.change(n=>{const o=n.createElement("media",{url:t});e.insertContent(o,i),n.setSelection(o,"on");});}}}var wp=n(47),_p=n.n(wp);const kp="0 0 64 42";class vp{constructor(t,e){const n=e.providers,i=e.extraProviders||[],o=new Set(e.removeProviders),r=n.concat(i).filter(t=>{const e=t.name;return e?!o.has(e):(fs.a.warn("media-embed-no-provider-name: The configured media provider has no name and cannot be used.",{provider:t}),!1)});this.locale=t,this.providerDefinitions=r;}hasMedia(t){return !!this._getMedia(t)}getMediaViewElement(t,e,n){return this._getMedia(e).getViewElement(t,n)}_getMedia(t){if(!t)return new yp(this.locale);t=t.trim();for(const e of this.providerDefinitions){const n=e.html;let i=e.url;Array.isArray(i)||(i=[i]);for(const e of i){const i=this._getUrlMatches(t,e);if(i)return new yp(this.locale,t,i,n)}}return null}_getUrlMatches(t,e){let n=t.match(e);if(n)return n;let i=t.replace(/^https?:\/\//,"");return (n=i.match(e))?n:(n=(i=i.replace(/^www\./,"")).match(e))||null}}class yp{constructor(t,e,n,i){this.url=this._getValidUrl(e),this._t=t.t,this._match=n,this._previewRenderer=i;}getViewElement(t,e){const n={};if(e.renderForEditingView||e.renderMediaPreview&&this.url&&this._previewRenderer){this.url&&(n["data-oembed-url"]=this.url),e.renderForEditingView&&(n.class="ck-media__wrapper");const i=this._getPreviewHtml(e);return t.createUIElement("div",n,function(t){const e=this.toDomElement(t);return e.innerHTML=i,e})}return this.url&&(n.url=this.url),t.createEmptyElement("oembed",n)}_getPreviewHtml(t){return this._previewRenderer?this._previewRenderer(this._match):this.url&&t.renderForEditingView?this._getPlaceholderHtml():""}_getPlaceholderHtml(){const t=new Md,e=new Pd;return t.text=this._t("Open media in new tab"),e.content=_p.a,e.viewBox=kp,new ol({tag:"div",attributes:{class:"ck ck-reset_all ck-media__placeholder"},children:[{tag:"div",attributes:{class:"ck-media__placeholder__icon"},children:[e]},{tag:"a",attributes:{class:"ck-media__placeholder__url",target:"new",href:this.url},children:[{tag:"span",attributes:{class:"ck-media__placeholder__url__text"},children:[this.url]},t]}]}).render().outerHTML}_getValidUrl(t){return t?t.match(/^https?/)?t:"https://"+t:null}}n(118);class xp extends Nl{constructor(t){super(t),t.config.define("mediaEmbed",{providers:[{name:"dailymotion",url:/^dailymotion\.com\/video\/(\w+)/,html:t=>{return '<div style="position: relative; padding-bottom: 100%; height: 0; ">'+`<iframe src="https://www.dailymotion.com/embed/video/${t[1]}" `+'style="position: absolute; width: 100%; height: 100%; top: 0; left: 0;" frameborder="0" width="480" height="270" allowfullscreen allow="autoplay"></iframe></div>'}},{name:"spotify",url:[/^open\.spotify\.com\/(artist\/\w+)/,/^open\.spotify\.com\/(album\/\w+)/,/^open\.spotify\.com\/(track\/\w+)/],html:t=>{return '<div style="position: relative; padding-bottom: 100%; height: 0; padding-bottom: 126%;">'+`<iframe src="https://open.spotify.com/embed/${t[1]}" `+'style="position: absolute; width: 100%; height: 100%; top: 0; left: 0;" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe></div>'}},{name:"youtube",url:[/^youtube\.com\/watch\?v=([\w-]+)/,/^youtube\.com\/v\/([\w-]+)/,/^youtube\.com\/embed\/([\w-]+)/,/^youtu\.be\/([\w-]+)/],html:t=>{return '<div style="position: relative; padding-bottom: 100%; height: 0; padding-bottom: 56.2493%;">'+`<iframe src="https://www.youtube.com/embed/${t[1]}" `+'style="position: absolute; width: 100%; height: 100%; top: 0; left: 0;" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe></div>'}},{name:"vimeo",url:[/^vimeo\.com\/(\d+)/,/^vimeo\.com\/[^/]+\/[^/]+\/video\/(\d+)/,/^vimeo\.com\/album\/[^/]+\/video\/(\d+)/,/^vimeo\.com\/channels\/[^/]+\/(\d+)/,/^vimeo\.com\/groups\/[^/]+\/videos\/(\d+)/,/^vimeo\.com\/ondemand\/[^/]+\/(\d+)/,/^player\.vimeo\.com\/video\/(\d+)/],html:t=>{return '<div style="position: relative; padding-bottom: 100%; height: 0; padding-bottom: 56.2493%;">'+`<iframe src="https://player.vimeo.com/video/${t[1]}" `+'style="position: absolute; width: 100%; height: 100%; top: 0; left: 0;" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe></div>'}},{name:"instagram",url:/^instagram\.com\/p\/(\w+)/},{name:"twitter",url:/^twitter\.com/},{name:"googleMaps",url:/^google\.com\/maps/},{name:"flickr",url:/^flickr\.com/},{name:"facebook",url:/^facebook\.com/}]}),this.registry=new vp(t.locale,t.config.get("mediaEmbed"));}init(){const t=this.editor,e=t.model.schema,n=t.t,i=t.conversion,o=t.config.get("mediaEmbed.previewsInData"),r=this.registry;t.commands.add("mediaEmbed",new bp(t)),e.register("media",{isObject:!0,isBlock:!0,allowWhere:"$block",allowAttributes:["url"]}),i.for("dataDowncast").add(aa({model:"media",view:(t,e)=>{const n=t.getAttribute("url");return mp(e,r,n,{renderMediaPreview:n&&o})}})),i.for("dataDowncast").add(hp(r,{renderMediaPreview:o})),i.for("editingDowncast").add(aa({model:"media",view:(t,e)=>{const i=t.getAttribute("url");return function(t,e,n){return e.setCustomProperty(fp,!0,t),gf(t,e,{label:n})}(mp(e,r,i,{renderForEditingView:!0}),e,n("bh"))}})),i.for("editingDowncast").add(hp(r,{renderForEditingView:!0})),i.for("upcast").add(Oa({view:{name:"oembed",attributes:{url:!0}},model:(t,e)=>{const n=t.getAttribute("url");if(r.hasMedia(n))return e.createElement("media",{url:n})}})).add(Oa({view:{name:"div",attributes:{"data-oembed-url":!0}},model:(t,e)=>{const n=t.getAttribute("data-oembed-url");if(r.hasMedia(n))return e.createElement("media",{url:n})}}));}}const Ap=/^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w.-]+)+[\w\-._~:/?#[\]@!$&'()*+,;=]+$/;class Cp extends Nl{static get requires(){return [Ll,Dd]}static get pluginName(){return "AutoMediaEmbed"}constructor(t){super(t),this._timeoutId=null,this._positionToInsert=null;}init(){const t=this.editor,e=t.model.document;this.listenTo(t.plugins.get(Ll),"inputTransformation",()=>{const t=e.selection.getFirstRange(),n=Mc.fromPosition(t.start);n.stickiness="toPrevious";const i=Mc.fromPosition(t.end);i.stickiness="toNext",e.once("change:data",()=>{this._embedMediaBetweenPositions(n,i),n.detach(),i.detach();},{priority:"high"});}),t.commands.get("undo").on("execute",()=>{this._timeoutId&&(Jo.window.clearTimeout(this._timeoutId),this._positionToInsert.detach(),this._timeoutId=null,this._positionToInsert=null);},{priority:"high"});}_embedMediaBetweenPositions(t,e){const n=this.editor,i=n.plugins.get(xp).registry,o=new Xs(t,e),r=o.getWalker({ignoreElementEnd:!0});let s="";for(const t of r)t.item.is("textProxy")&&(s+=t.item.data);if(!(s=s.trim()).match(Ap))return;if(!i.hasMedia(s))return;const a=n.commands.get("mediaEmbed");a.isEnabled&&(this._positionToInsert=Mc.fromPosition(t),this._timeoutId=Jo.window.setTimeout(()=>{n.model.change(t=>{this._timeoutId=null,t.remove(o),"$graveyard"!==this._positionToInsert.root.rootName&&t.setSelection(this._positionToInsert),a.execute(s),this._positionToInsert.detach(),this._positionToInsert=null;});},100));}}n(120);class Tp extends yl{constructor(t,e){super(e);const n=e.t;this.focusTracker=new Kc,this.keystrokes=new Uc,this.urlInputView=this._createUrlInput(),this.saveButtonView=this._createButton(n("br"),zf.a,"ck-button-save"),this.saveButtonView.type="submit",this.cancelButtonView=this._createButton(n("bs"),Ff.a,"ck-button-cancel","cancel"),this._focusables=new Xc,this._focusCycler=new Tl({focusables:this._focusables,focusTracker:this.focusTracker,keystrokeHandler:this.keystrokes,actions:{focusPrevious:"shift + tab",focusNext:"tab"}}),this._validators=t,this.setTemplate({tag:"form",attributes:{class:["ck","ck-media-form"],tabindex:"-1"},children:[this.urlInputView,this.saveButtonView,this.cancelButtonView]});}render(){super.render(),jf({view:this}),[this.urlInputView,this.saveButtonView,this.cancelButtonView].forEach(t=>{this._focusables.add(t),this.focusTracker.add(t.element);}),this.keystrokes.listenTo(this.element);const t=t=>t.stopPropagation();this.keystrokes.set("arrowright",t),this.keystrokes.set("arrowleft",t),this.keystrokes.set("arrowup",t),this.keystrokes.set("arrowdown",t),this.listenTo(this.urlInputView.element,"selectstart",(t,e)=>{e.stopPropagation();},{priority:"high"});}focus(){this._focusCycler.focusFirst();}get url(){return this.urlInputView.inputView.element.value.trim()}set url(t){this.urlInputView.inputView.element.value=t.trim();}isValid(){this.resetFormStatus();for(const t of this._validators){const e=t(this);if(e)return this.urlInputView.errorText=e,!1}return !0}resetFormStatus(){this.urlInputView.errorText=null,this.urlInputView.infoText=null;}_createUrlInput(){const t=this.locale.t,e=new Df(this.locale,Lf),n=e.inputView;return e.label=t("bt"),n.placeholder="https://example.com",n.on("input",()=>{e.infoText=n.element.value?t("bu"):null;}),e}_createButton(t,e,n,i){const o=new Sd(this.locale);return o.set({label:t,icon:e,tooltip:!0}),o.extendTemplate({attributes:{class:n}}),i&&o.delegate("execute").to(this,i),o}}var Pp=n(48),Mp=n.n(Pp);class Sp extends Nl{static get requires(){return [xp]}init(){const t=this.editor,e=t.commands.get("mediaEmbed"),n=t.plugins.get(xp).registry;t.ui.componentFactory.add("mediaEmbed",i=>{const o=new Tp(function(t,e){return [e=>{if(!e.url.length)return t("bj")},n=>{if(!e.hasMedia(n.url))return t("bk")}]}(t.t,n),i),r=nu(i);return this._setUpDropdown(r,o,e,t),this._setUpForm(o,r,e),r});}_setUpDropdown(t,e,n){const i=this.editor,o=i.t,r=t.buttonView;function s(){i.editing.view.focus(),t.isOpen=!1;}t.bind("isEnabled").to(n),t.panelView.children.add(e),r.set({label:o("bi"),icon:Mp.a,tooltip:!0}),r.on("open",()=>{e.url=n.value||"",e.urlInputView.select(),e.focus();},{priority:"low"}),t.on("submit",()=>{e.isValid()&&(i.execute("mediaEmbed",e.url),s());}),t.on("change:isOpen",()=>e.resetFormStatus()),t.on("cancel",()=>s());}_setUpForm(t,e,n){t.delegate("submit","cancel").to(e),t.urlInputView.bind("value").to(n,"value"),t.urlInputView.bind("isReadOnly").to(n,"isEnabled",t=>!t),t.saveButtonView.bind("isEnabled").to(n);}}n(122);function Ip(t){return t.replace(/<span(?: class="Apple-converted-space"|)>(\s+)<\/span>/g,(t,e)=>1===e.length?" ":Array(e.length+1).join("  ").substr(0,e.length))}function Ep(t){const e=new DOMParser,n=function(t){return Ip(Ip(t)).replace(/ <\//g," </").replace(/ <o:p><\/o:p>/g," <o:p></o:p>").replace(/>(\s*(\r\n?|\n)\s*)+</g,"><")}(function(t){const e=t.match(/<\/body>(.*?)(<\/html>|$)/);e&&e[1]&&(t=t.slice(0,e.index)+t.slice(e.index).replace(e[1],""));return t}(t=t.replace(/<!--\[if gte vml 1]>/g,""))),i=e.parseFromString(n,"text/html");!function(t){t.querySelectorAll("span[style*=spacerun]").forEach(t=>{const e=t.childNodes[0].data.length;t.innerHTML=Array(e+1).join("  ").substr(0,e);});}(i);const o=i.body.innerHTML,r=function(t){const e=new er({blockFiller:No}),n=t.createDocumentFragment(),i=t.body.childNodes;for(;i.length>0;)n.appendChild(i[0]);return e.domToView(n)}(i),s=function(t){const e=[],n=[],i=Array.from(t.getElementsByTagName("style"));for(const t of i)t.sheet&&t.sheet.cssRules&&t.sheet.cssRules.length&&(e.push(t.sheet),n.push(t.innerHTML));return {styles:e,stylesString:n.join(" ")}}(i);return {body:r,bodyString:o,styles:s.styles,stylesString:s.stylesString}}function Np(t,e){if(!t.childCount)return;const n=new _m,i=function(t,e){const n=e.createRangeIn(t),i=new hi({name:/^p|h\d+$/,styles:{"mso-list":/.*/}}),o=[];for(const t of n)if("elementStart"===t.type&&i.match(t.item)){const e=Op(t.item);o.push({element:t.item,id:e.id,order:e.order,indent:e.indent});}return o}(t,n);if(!i.length)return;let o=null;i.forEach((t,r)=>{if(!o||function(t,e){return t.id!==e.id}(i[r-1],t)){const i=function(t,e){const n=/mso-level-number-format:([^;]*);/gi,i=new RegExp(`@list l${t.id}:level${t.indent}\\s*({[^}]*)`,"gi").exec(e);let o="decimal";if(i&&i[1]){const t=n.exec(i[1]);t&&t[1]&&(o=t[1].trim());}return {type:"bullet"!==o&&"image"!==o?"ol":"ul",style:o}}(t,e);o=function(t,e,n){const i=new mi(t.type),o=e.parent.getChildIndex(e);return n.insertChild(o,i,e.parent),i}(i,t.element,n);}const s=function(t,e){return function(t,e){const n=new hi({name:"span",styles:{"mso-list":"Ignore"}}),i=e.createRangeIn(t);for(const t of i)"elementStart"===t.type&&n.match(t.item)&&e.remove(t.item);}(t,e),e.rename("li",t)}(t.element,n);n.appendChild(s,o);});}function Op(t){const e={},n=t.getStyle("mso-list");return n&&(e.id=parseInt(n.match(/(^|\s+)l(\d+)/i)[2]),e.order=parseInt(n.match(/\s*lfo(\d+)/i)[1]),e.indent=parseInt(n.match(/\s*level(\d+)/i)[1])),e}function Rp(t,e){if(!t.childCount)return;const n=new _m;!function(t,e,n){const i=n.createRangeIn(e),o=new hi({name:"img"}),r=[];for(const e of i)if(o.match(e.item)){const n=e.item,i=n.getAttribute("v:shapes")?n.getAttribute("v:shapes").split(" "):[];i.length&&i.every(e=>t.indexOf(e)>-1)?r.push(n):n.getAttribute("src")||r.push(n);}for(const t of r)n.remove(t);}(function(t,e){const n=e.createRangeIn(t),i=new hi({name:/v:(.+)/}),o=[];for(const t of n){const e=t.item,n=e.previousSibling&&e.previousSibling.name||null;i.match(e)&&e.getAttribute("o:gfxdata")&&"v:shapetype"!==n&&o.push(t.item.getAttribute("id"));}return o}(t,n),t,n),function(t,e){const n=e.createRangeIn(t),i=new hi({name:/v:(.+)/}),o=[];for(const t of n)i.match(t.item)&&o.push(t.item);for(const t of o)e.remove(t);}(t,n);const i=function(t,e){const n=e.createRangeIn(t),i=new hi({name:"img"}),o=[];for(const t of n)i.match(t.item)&&t.item.getAttribute("src").startsWith("file://")&&o.push(t.item);return o}(t,n);i.length&&function(t,e,n){if(t.length===e.length)for(let i=0;i<t.length;i++){const o=`data:${e[i].type};base64,${Dp(e[i].hex)}`;n.setAttribute("src",o,t[i]);}}(i,function(t){if(!t)return [];const e=/{\\pict[\s\S]+?\\bliptag-?\d+(\\blipupi-?\d+)?({\\\*\\blipuid\s?[\da-fA-F]+)?[\s}]*?/,n=new RegExp("(?:("+e.source+"))([\\da-fA-F\\s]+)\\}","g"),i=t.match(n),o=[];if(i)for(const t of i){let n=!1;t.includes("\\pngblip")?n="image/png":t.includes("\\jpegblip")&&(n="image/jpeg"),n&&o.push({hex:t.replace(e,"").replace(/[^\da-fA-F]/g,""),type:n});}return o}(e),n);}function Dp(t){return btoa(t.match(/\w{2}/g).map(t=>String.fromCharCode(parseInt(t,16))).join(""))}function Lp(t,e){let n=e.parent;for(;n;){if(n.name===t)return n;n=n.parent;}}function jp(t,e,n,i,o=1){e>o?i.setAttribute(t,e,n):i.removeAttribute(t,n);}function Vp(t,e,n={}){const i=t.createElement("tableCell",n);t.insertElement("paragraph",i),t.insert(i,e);}function zp(){return t=>{t.on("element:table",(t,e,n)=>{const i=e.viewItem;if(!n.consumable.test(i,{name:!0}))return;const{rows:o,headingRows:r,headingColumns:s}=function(t){const e={headingRows:0,headingColumns:0},n=[],i=[];let o;for(const r of Array.from(t.getChildren()))if("tbody"===r.name||"thead"===r.name||"tfoot"===r.name){"thead"!==r.name||o||(o=r);const t=Array.from(r.getChildren()).filter(t=>t.is("element","tr"));for(const r of t)if("thead"===r.parent.name&&r.parent===o)e.headingRows++,n.push(r);else{i.push(r);const t=Fp(r);t>e.headingColumns&&(e.headingColumns=t);}}return e.rows=[...n,...i],e}(i),a={};s&&(a.headingColumns=s),r&&(a.headingRows=r);const c=n.writer.createElement("table",a),l=n.splitToAllowedParent(c,e.modelCursor);if(l){if(n.writer.insert(c,l.position),n.consumable.consume(i,{name:!0}),o.length)o.forEach(t=>n.convertItem(t,n.writer.createPositionAt(c,"end")));else{const t=n.writer.createElement("tableRow");n.writer.insert(t,n.writer.createPositionAt(c,"end")),Vp(n.writer,n.writer.createPositionAt(t,"end"));}e.modelRange=n.writer.createRange(n.writer.createPositionBefore(c),n.writer.createPositionAfter(c)),l.cursorParent?e.modelCursor=n.writer.createPositionAt(l.cursorParent,0):e.modelCursor=e.modelRange.end;}});}}function Bp(t){return e=>{e.on(`element:${t}`,(t,e,n)=>{const i=e.viewItem;if(!n.consumable.test(i,{name:!0}))return;const o=n.writer.createElement("tableCell"),r=n.splitToAllowedParent(o,e.modelCursor);if(!r)return;n.writer.insert(o,r.position),n.consumable.consume(i,{name:!0});const s=n.writer.createPositionAt(o,0);n.convertChildren(i,s),o.childCount||n.writer.insertElement("paragraph",s),e.modelRange=n.writer.createRange(n.writer.createPositionBefore(o),n.writer.createPositionAfter(o)),e.modelCursor=e.modelRange.end;});}}function Fp(t){let e=0,n=0;const i=Array.from(t.getChildren()).filter(t=>"th"===t.name||"td"===t.name);for(;n<i.length&&"th"===i[n].name;){const t=i[n];e+=parseInt(t.getAttribute("colspan")||1),n++;}return e}class Up{constructor(t,e={}){this.table=t,this.startRow=e.startRow||0,this.endRow="number"==typeof e.endRow?e.endRow:void 0,this.includeSpanned=!!e.includeSpanned,this.column="number"==typeof e.column?e.column:void 0,this._skipRows=new Set,this._row=0,this._column=0,this._cell=0,this._spannedCells=new Map;}[Symbol.iterator](){return this}next(){const t=this.table.getChild(this._row);if(!t||this._isOverEndRow())return {done:!0};if(this._isSpanned(this._row,this._column)){const t=this._column,e=this._formatOutValue(void 0,t);return this._column++,!this.includeSpanned||this._shouldSkipRow()||this._shouldSkipColumn(t,1)?this.next():e}const e=t.getChild(this._cell);if(!e)return this._row++,this._column=0,this._cell=0,this.next();const n=parseInt(e.getAttribute("colspan")||1),i=parseInt(e.getAttribute("rowspan")||1);(n>1||i>1)&&this._recordSpans(this._row,this._column,i,n);const o=this._column,r=this._formatOutValue(e,o,i,n);return this._column++,this._cell++,this._shouldSkipRow()||this._shouldSkipColumn(o,n)?this.next():r}skipRow(t){this._skipRows.add(t);}_isOverEndRow(){return void 0!==this.endRow&&this._row>this.endRow}_formatOutValue(t,e,n=1,i=1){return {done:!1,value:{cell:t,row:this._row,column:e,rowspan:n,colspan:i,cellIndex:this._cell}}}_shouldSkipRow(){const t=this._row<this.startRow,e=this._skipRows.has(this._row);return t||e}_shouldSkipColumn(t,e){if(void 0===this.column)return !1;const n=t===this.column,i=t<this.column&&t+e>this.column;return !n&&!i}_isSpanned(t,e){if(!this._spannedCells.has(t))return !1;return this._spannedCells.get(t).has(e)}_recordSpans(t,e,n,i){for(let n=e+1;n<=e+i-1;n++)this._markSpannedCell(t,n);for(let o=t+1;o<t+n;o++)for(let t=e;t<=e+i-1;t++)this._markSpannedCell(o,t);}_markSpannedCell(t,e){this._spannedCells.has(t)||this._spannedCells.set(t,new Map),this._spannedCells.get(t).set(e,!0);}}const Hp=Symbol("isTable");function qp(t){return !!t.getCustomProperty(Hp)&&mf(t)}function Wp(t){const e=t.getSelectedElement();return !(!e||!qp(e))}function Yp(t){const e=Lp("table",t.getFirstPosition());return !(!e||!qp(e.parent))}function $p(t={}){return e=>e.on("insert:table",(e,n,i)=>{const o=n.item;if(!i.consumable.consume(o,"insert"))return;i.consumable.consume(o,"attribute:headingRows:table"),i.consumable.consume(o,"attribute:headingColumns:table");const r=t&&t.asWidget,s=i.writer.createContainerElement("figure",{class:"table"}),a=i.writer.createContainerElement("table");let c;i.writer.insert(i.writer.createPositionAt(s,0),a),r&&(c=function(t,e){return e.setCustomProperty(Hp,!0,t),gf(t,e,{hasSelectionHandler:!0})}(s,i.writer));const l=new Up(o),d={headingRows:o.getAttribute("headingRows")||0,headingColumns:o.getAttribute("headingColumns")||0};for(const e of l){const{row:n,cell:r}=e,s=ob(ib(n,d),a,i),c=eb(o.getChild(n),n,s,i);i.consumable.consume(r,"insert"),tb(e,d,i.writer.createPositionAt(c,"end"),i,t);}const u=i.mapper.toViewPosition(n.range.start);i.mapper.bindElements(o,r?c:s),i.writer.insert(u,r?c:s);})}function Gp(t={}){return e=>e.on("insert:tableRow",(e,n,i)=>{const o=n.item;if(!i.consumable.consume(o,"insert"))return;const r=o.parent,s=cb(i.mapper.toViewElement(r)),a=r.getChildIndex(o),c=new Up(r,{startRow:a,endRow:a}),l={headingRows:r.getAttribute("headingRows")||0,headingColumns:r.getAttribute("headingColumns")||0};for(const e of c){const n=eb(o,a,ob(ib(a,l),s,i),i);i.consumable.consume(e.cell,"insert"),tb(e,l,i.writer.createPositionAt(n,"end"),i,t);}})}function Qp(t={}){return e=>e.on("insert:tableCell",(e,n,i)=>{const o=n.item;if(!i.consumable.consume(o,"insert"))return;const r=o.parent,s=r.parent,a=s.getChildIndex(r),c=new Up(s,{startRow:a,endRow:a}),l={headingRows:s.getAttribute("headingRows")||0,headingColumns:s.getAttribute("headingColumns")||0};for(const e of c)if(e.cell===o){const n=i.mapper.toViewElement(r);return void tb(e,l,i.writer.createPositionAt(n,r.getChildIndex(o)),i,t)}})}function Kp(t={}){const e=!!t.asWidget;return t=>t.on("attribute:headingRows:table",(t,n,i)=>{const o=n.item;if(!i.consumable.consume(n.item,t.name))return;const r=cb(i.mapper.toViewElement(o)),s=n.attributeOldValue,a=n.attributeNewValue;if(a>s){const t=Array.from(o.getChildren()).filter(({index:t})=>c(t,s-1,a));ab(t,ob("thead",r,i),i,"end");for(const n of t)for(const t of n.getChildren())Zp(t,"th",i,e);sb("tbody",r,i);}else{ab(Array.from(o.getChildren()).filter(({index:t})=>c(t,a-1,s)).reverse(),ob("tbody",r,i),i,0);const t=new Up(o,{startRow:a?a-1:a,endRow:s-1}),n={headingRows:o.getAttribute("headingRows")||0,headingColumns:o.getAttribute("headingColumns")||0};for(const o of t)Xp(o,n,i,e);sb("thead",r,i);}function c(t,e,n){return t>e&&t<n}})}function Jp(t={}){const e=!!t.asWidget;return t=>t.on("attribute:headingColumns:table",(t,n,i)=>{const o=n.item;if(!i.consumable.consume(n.item,t.name))return;const r={headingRows:o.getAttribute("headingRows")||0,headingColumns:o.getAttribute("headingColumns")||0},s=n.attributeOldValue,a=n.attributeNewValue,c=(s>a?s:a)-1;for(const t of new Up(o))t.column>c||Xp(t,r,i,e);})}function Zp(t,e,n,i){const o=n.writer,r=n.mapper.toViewElement(t);if(!r)return;let s;if(i){s=bf(o.createEditableElement(e,r.getAttributes()),o),o.insert(o.createPositionAfter(r),s),o.move(o.createRangeIn(r),o.createPositionAt(s,0)),o.remove(o.createRangeOn(r));}else s=o.rename(e,r);n.mapper.bindElements(t,s);}function Xp(t,e,n,i){const{cell:o}=t,r=nb(t,e),s=n.mapper.toViewElement(o);s&&s.name!==r&&Zp(o,r,n,i);}function tb(t,e,n,i,o){const r=o&&o.asWidget,s=nb(t,e),a=r?bf(i.writer.createEditableElement(s),i.writer):i.writer.createContainerElement(s),c=t.cell,l=1===c.childCount&&"paragraph"===c.getChild(0).name;if(i.writer.insert(n,a),l){const t=c.getChild(0),e=i.writer.createPositionAt(a,"end");if(i.consumable.consume(t,"insert"),o.asWidget){const n=[...t.getAttributeKeys()].length?"p":"span",o=i.writer.createContainerElement(n);i.mapper.bindElements(t,o),i.writer.insert(e,o),i.mapper.bindElements(c,a);}else i.mapper.bindElements(c,a),i.mapper.bindElements(t,a);}else i.mapper.bindElements(c,a);}function eb(t,e,n,i){let o=i.mapper.toViewElement(t);if(!o){i.consumable.consume(t,"insert"),o=i.writer.createContainerElement("tr"),i.mapper.bindElements(t,o);const r=t.parent.getAttribute("headingRows")||0,s=r>0&&e>=r?e-r:e,a=i.writer.createPositionAt(n,s);i.writer.insert(a,o);}return o}function nb(t,e){const{row:n,column:i}=t,{headingColumns:o,headingRows:r}=e;return r&&r>n?"th":o&&o>i?"th":"td"}function ib(t,e){return t<e.headingRows?"thead":"tbody"}function ob(t,e,n){const i=rb(t,e);return i||function(t,e,n){const i=n.writer.createContainerElement(t),o=n.writer.createPositionAt(e,"tbody"==t?"end":0);return n.writer.insert(o,i),i}(t,e,n)}function rb(t,e){for(const n of e.getChildren())if(n.name==t)return n}function sb(t,e,n){const i=rb(t,e);i&&0===i.childCount&&n.writer.remove(n.writer.createRangeOn(i));}function ab(t,e,n,i){for(const o of t){const t=n.mapper.toViewElement(o);t&&n.writer.move(n.writer.createRangeOn(t),n.writer.createPositionAt(e,i));}}function cb(t){for(const e of t.getChildren())if("table"===e.name)return e}class lb extends Nl{static get pluginName(){return "TableUtils"}getCellLocation(t){const e=t.parent,n=e.parent,i=n.getChildIndex(e),o=new Up(n,{startRow:i,endRow:i});for(const{cell:e,row:n,column:i}of o)if(e===t)return {row:n,column:i}}createTable(t,e,n){const i=t.createElement("table");return db(t,i,0,e,n),i}insertRows(t,e={}){const n=this.editor.model,i=e.at||0,o=e.rows||1;n.change(e=>{const n=t.getAttribute("headingRows")||0;if(n>i&&e.setAttribute("headingRows",n+o,t),0===i||i===t.childCount)return void db(e,t,i,o,this.getColumns(t));const r=new Up(t,{endRow:i});let s=0;for(const{row:t,rowspan:n,colspan:a,cell:c}of r){t<i&&t+n>i&&e.setAttribute("rowspan",n+o,c),t===i&&(s+=a);}db(e,t,i,o,s);});}insertColumns(t,e={}){const n=this.editor.model,i=e.at||0,o=e.columns||1;n.change(e=>{const n=t.getAttribute("headingColumns");i<n&&e.setAttribute("headingColumns",n+o,t);const r=this.getColumns(t);if(0===i||r===i){for(const n of t.getChildren())ub(o,e,e.createPositionAt(n,i?"end":0));return}const s=new Up(t,{column:i,includeSpanned:!0});for(const{row:n,column:r,cell:a,colspan:c,rowspan:l,cellIndex:d}of s)if(r!==i){if(e.setAttribute("colspan",c+o,a),s.skipRow(n),l>1)for(let t=n+1;t<n+l;t++)s.skipRow(t);}else{const i=e.createPositionAt(t.getChild(n),d);ub(o,e,i);}});}splitCellVertically(t,e=2){const n=this.editor.model,i=t.parent.parent,o=parseInt(t.getAttribute("rowspan")||1),r=parseInt(t.getAttribute("colspan")||1);n.change(n=>{if(r>1){const{newCellsSpan:i,updatedSpan:s}=hb(r,e);jp("colspan",s,t,n);const a={};i>1&&(a.colspan=i),o>1&&(a.rowspan=o),ub(r>e?e-1:r-1,n,n.createPositionAfter(t),a);}if(r<e){const s=e-r,a=[...new Up(i)],{column:c}=a.find(({cell:e})=>e===t),l=a.filter(({cell:e,colspan:n,column:i})=>{return e!==t&&i===c||i<c&&i+n>c});for(const{cell:t,colspan:e}of l)n.setAttribute("colspan",e+s,t);const d={};o>1&&(d.rowspan=o),ub(s,n,n.createPositionAfter(t),d);const u=i.getAttribute("headingColumns")||0;u>c&&jp("headingColumns",u+s,i,n);}});}splitCellHorizontally(t,e=2){const n=this.editor.model,i=t.parent,o=i.parent,r=o.getChildIndex(i),s=parseInt(t.getAttribute("rowspan")||1),a=parseInt(t.getAttribute("colspan")||1);n.change(n=>{if(s>1){const i=[...new Up(o,{startRow:r,endRow:r+s-1,includeSpanned:!0})],{newCellsSpan:c,updatedSpan:l}=hb(s,e);jp("rowspan",l,t,n);const{column:d}=i.find(({cell:e})=>e===t),u={};c>1&&(u.rowspan=c),a>1&&(u.colspan=a);for(const{column:t,row:e,cellIndex:s}of i){if(e>=r+l&&t===d&&(e+r+l)%c==0){ub(1,n,n.createPositionAt(o.getChild(e),s),u);}}}if(s<e){const i=e-s,c=[...new Up(o,{startRow:0,endRow:r})];for(const{cell:e,rowspan:o,row:s}of c)if(e!==t&&s+o>r){const t=o+i;n.setAttribute("rowspan",t,e);}const l={};a>1&&(l.colspan=a),db(n,o,r+1,i,1,l);const d=o.getAttribute("headingRows")||0;d>r&&jp("headingRows",d+i,o,n);}});}getColumns(t){return [...t.getChild(0).getChildren()].reduce((t,e)=>{return t+parseInt(e.getAttribute("colspan")||1)},0)}}function db(t,e,n,i,o,r={}){for(let s=0;s<i;s++){const i=t.createElement("tableRow");t.insert(i,e,n),ub(o,t,t.createPositionAt(i,"end"),r);}}function ub(t,e,n,i={}){for(let o=0;o<t;o++)Vp(e,n,i);}function hb(t,e){if(t<e)return {newCellsSpan:1,updatedSpan:1};const n=Math.floor(t/e);return {newCellsSpan:n,updatedSpan:t-n*e+n}}class fb extends jl{refresh(){const t=this.editor.model,e=t.document.selection,n=t.schema,i=function(t){const e=t.parent;return e===e.root?e:e.parent}(e.getFirstPosition());this.isEnabled=n.checkChild(i,"table");}execute(t={}){const e=this.editor.model,n=e.document.selection,i=this.editor.plugins.get(lb),o=parseInt(t.rows)||2,r=parseInt(t.columns)||2,s=wf(n,e);e.change(t=>{const n=i.createTable(t,o,r);e.insertContent(n,s),t.setSelection(t.createPositionAt(n.getNodeByPath([0,0,0]),0));});}}class mb extends jl{constructor(t,e={}){super(t),this.order=e.order||"below";}refresh(){const t=Lp("table",this.editor.model.document.selection.getFirstPosition());this.isEnabled=!!t;}execute(){const t=this.editor,e=t.model.document.selection,n=t.plugins.get(lb),i=Lp("tableCell",e.getFirstPosition()).parent,o=i.parent,r=o.getChildIndex(i),s="below"===this.order?r+1:r;n.insertRows(o,{rows:1,at:s});}}class gb extends jl{constructor(t,e={}){super(t),this.order=e.order||"right";}refresh(){const t=Lp("table",this.editor.model.document.selection.getFirstPosition());this.isEnabled=!!t;}execute(){const t=this.editor,e=t.model.document.selection,n=t.plugins.get(lb),i=Lp("tableCell",e.getFirstPosition()),o=i.parent.parent,{column:r}=n.getCellLocation(i),s="right"===this.order?r+1:r;n.insertColumns(o,{columns:1,at:s});}}class pb extends jl{constructor(t,e={}){super(t),this.direction=e.direction||"horizontally";}refresh(){const t=Lp("tableCell",this.editor.model.document.selection.getFirstPosition());this.isEnabled=!!t;}execute(){const t=Lp("tableCell",this.editor.model.document.selection.getFirstPosition()),e="horizontally"===this.direction,n=this.editor.plugins.get(lb);e?n.splitCellHorizontally(t,2):n.splitCellVertically(t,2);}}class bb extends jl{constructor(t,e){super(t),this.direction=e.direction,this.isHorizontal="right"==this.direction||"left"==this.direction;}refresh(){const t=this._getMergeableCell();this.isEnabled=!!t,this.value=t;}execute(){const t=this.editor.model,e=Lp("tableCell",t.document.selection.getFirstPosition()),n=this.value,i=this.direction;t.change(t=>{const o="right"==i||"down"==i,r=o?e:n,s=o?n:e,a=s.parent;!function(t,e,n){wb(t)||(wb(e)&&n.remove(n.createRangeIn(e)),n.move(n.createRangeIn(t),n.createPositionAt(e,"end")));n.remove(t);}(s,r,t);const c=this.isHorizontal?"colspan":"rowspan",l=parseInt(e.getAttribute(c)||1),d=parseInt(n.getAttribute(c)||1);t.setAttribute(c,l+d,r),t.setSelection(t.createRangeIn(r)),a.childCount||function(t,e){const n=t.parent,i=n.getChildIndex(t);for(const{cell:t,row:o,rowspan:r}of new Up(n,{endRow:i})){const n=o+r-1>=i;n&&jp("rowspan",r-1,t,e);}e.remove(t);}(a,t);});}_getMergeableCell(){const t=Lp("tableCell",this.editor.model.document.selection.getFirstPosition());if(!t)return;const e=this.editor.plugins.get(lb),n=this.isHorizontal?function(t,e,n){const i="right"==e?t.nextSibling:t.previousSibling;if(!i)return;const o="right"==e?t:i,r="right"==e?i:t,{column:s}=n.getCellLocation(o),{column:a}=n.getCellLocation(r),c=parseInt(o.getAttribute("colspan")||1);return s+c===a?i:void 0}(t,this.direction,e):function(t,e){const n=t.parent,i=n.parent,o=i.getChildIndex(n);if("down"==e&&o===i.childCount-1||"up"==e&&0===o)return;const r=parseInt(t.getAttribute("rowspan")||1),s=i.getAttribute("headingRows")||0;if(s&&("down"==e&&o+r===s||"up"==e&&o===s))return;const a=parseInt(t.getAttribute("rowspan")||1),c="down"==e?o+a:o,l=[...new Up(i,{endRow:c})],d=l.find(e=>e.cell===t).column,u=l.find(({row:t,rowspan:n,column:i})=>i===d&&("down"==e?t===c:c===t+n));return u&&u.cell}(t,this.direction);if(!n)return;const i=this.isHorizontal?"rowspan":"colspan",o=parseInt(t.getAttribute(i)||1);return parseInt(n.getAttribute(i)||1)===o?n:void 0}}function wb(t){return 1==t.childCount&&t.getChild(0).is("paragraph")&&t.getChild(0).isEmpty}class _b extends jl{refresh(){const t=Lp("tableCell",this.editor.model.document.selection.getFirstPosition());this.isEnabled=!!t&&t.parent.parent.childCount>1;}execute(){const t=this.editor.model,e=Lp("tableCell",t.document.selection.getFirstPosition()).parent,n=e.parent,i=n.getChildIndex(e),o=n.getAttribute("headingRows")||0;t.change(t=>{o&&i<=o&&jp("headingRows",o-1,n,t,0);const r=[...new Up(n,{endRow:i})],s=new Map;r.filter(({row:t,rowspan:e})=>t===i&&e>1).forEach(({column:t,cell:e,rowspan:n})=>s.set(t,{cell:e,rowspanToSet:n-1})),r.filter(({row:t,rowspan:e})=>t<=i-1&&t+e>i).forEach(({cell:e,rowspan:n})=>jp("rowspan",n-1,e,t));const a=i+1,c=new Up(n,{includeSpanned:!0,startRow:a,endRow:a});let l;for(const{row:e,column:i,cell:o}of[...c])if(s.has(i)){const{cell:o,rowspanToSet:r}=s.get(i),a=l?t.createPositionAfter(l):t.createPositionAt(n.getChild(e),0);t.move(t.createRangeOn(o),a),jp("rowspan",r,o,t),l=o;}else l=o;t.remove(e);});}}class kb extends jl{refresh(){const t=this.editor,e=t.model.document.selection,n=t.plugins.get(lb),i=Lp("tableCell",e.getFirstPosition());this.isEnabled=!!i&&n.getColumns(i.parent.parent)>1;}execute(){const t=this.editor.model,e=Lp("tableCell",t.document.selection.getFirstPosition()),n=e.parent,i=n.parent,o=i.getAttribute("headingColumns")||0,r=i.getChildIndex(n),s=[...new Up(i)],a=s.find(t=>t.cell===e).column;t.change(t=>{o&&r<=o&&t.setAttribute("headingColumns",o-1,i);for(const{cell:e,column:n,colspan:i}of s)n<=a&&i>1&&n+i>a?jp("colspan",i-1,e,t):n===a&&t.remove(e);});}}class vb extends jl{refresh(){const t=Lp("tableCell",this.editor.model.document.selection.getFirstPosition()),e=!!t;this.isEnabled=e,this.value=e&&this._isInHeading(t,t.parent.parent);}execute(){const t=this.editor.model,e=Lp("tableCell",t.document.selection.getFirstPosition()).parent,n=e.parent,i=n.getAttribute("headingRows")||0,o=e.index,r=i>o?o:o+1;t.change(t=>{if(r){const e=function(t,e,n){const i=[],o=new Up(t,{startRow:e>n?n:0,endRow:e-1});for(const{row:t,rowspan:n,cell:r}of o)n>1&&t+n>e&&i.push(r);return i}(n,r,i);for(const n of e)yb(n,r,t);}jp("headingRows",r,n,t,0);});}_isInHeading(t,e){const n=parseInt(e.getAttribute("headingRows")||0);return !!n&&t.parent.index<n}}function yb(t,e,n){const i=t.parent,o=i.parent,r=e-i.index,s={},a=parseInt(t.getAttribute("rowspan"))-r;a>1&&(s.rowspan=a);const c=o.getChildIndex(i),l=c+r,d=[...new Up(o,{startRow:c,endRow:l,includeSpanned:!0})];let u;for(const{row:e,column:i,cell:r,colspan:a,cellIndex:c}of d)if(r===t&&(u=i,a>1&&(s.colspan=a)),void 0!==u&&u===i&&e===l){const t=o.getChild(e);Vp(n,n.createPositionAt(t,c),s);}jp("rowspan",r,t,n);}class xb extends jl{refresh(){const t=Lp("tableCell",this.editor.model.document.selection.getFirstPosition()),e=!!t;this.isEnabled=e,this.value=e&&this._isInHeading(t,t.parent.parent);}execute(){const t=this.editor.model,e=t.document.selection,n=this.editor.plugins.get("TableUtils"),i=Lp("tableCell",e.getFirstPosition().parent),o=i.parent.parent,r=parseInt(o.getAttribute("headingColumns")||0),{column:s}=n.getCellLocation(i),a=r>s?s:s+1;t.change(t=>{jp("headingColumns",a,o,t,0);});}_isInHeading(t,e){const n=parseInt(e.getAttribute("headingColumns")||0),i=this.editor.plugins.get("TableUtils"),{column:o}=i.getCellLocation(t);return !!n&&o<n}}function Ab(t){t.document.registerPostFixer(e=>(function(t,e){const n=e.document.differ.getChanges();let i=!1;const o=new Set;for(const e of n){let n;"table"==e.name&&"insert"==e.type&&(n=e.position.nodeAfter),"tableRow"!=e.name&&"tableCell"!=e.name||(n=Lp("table",e.position)),Pb(e)&&(n=Lp("table",e.range.start)),n&&!o.has(n)&&(i=Cb(n,t)||i,i=Tb(n,t)||i,o.add(n));}return i})(e,t));}function Cb(t,e){let n=!1;const i=function(t){const e=parseInt(t.getAttribute("headingRows")||0),n=t.childCount,i=[];for(const{row:o,rowspan:r,cell:s}of new Up(t)){if(r<2)continue;const t=o<e,a=t?e:n;if(o+r>a){const t=a-o;i.push({cell:s,rowspan:t});}}return i}(t);if(i.length){n=!0;for(const t of i)jp("rowspan",t.rowspan,t.cell,e,1);}return n}function Tb(t,e){let n=!1;const i=function(t){const e={};for(const{row:n}of new Up(t,{includeSpanned:!0}))e[n]||(e[n]=0),e[n]+=1;return e}(t),o=i[0];if(!Object.values(i).every(t=>t===o)){const o=Object.values(i).reduce((t,e)=>e>t?e:t,0);for(const[r,s]of Object.entries(i)){const i=o-s;if(i){for(let n=0;n<i;n++)Vp(e,e.createPositionAt(t.getChild(r),"end"));n=!0;}}}return n}function Pb(t){const e="attribute"===t.type,n=t.attributeKey;return e&&("headingRows"===n||"colspan"===n||"rowspan"===n)}function Mb(t){t.document.registerPostFixer(e=>(function(t,e){const n=e.document.differ.getChanges();let i=!1;for(const e of n)"remove"==e.type&&e.position.parent.is("tableCell")&&(i=Eb(e.position.parent,t)||i),"insert"==e.type&&("table"==e.name&&(i=Sb(e.position.nodeAfter,t)||i),"tableRow"==e.name&&(i=Ib(e.position.nodeAfter,t)||i),"tableCell"==e.name&&(i=Eb(e.position.nodeAfter,t)||i));return i})(e,t));}function Sb(t,e){let n=!1;for(const i of t.getChildren())n=Ib(i,e)||n;return n}function Ib(t,e){let n=!1;for(const i of t.getChildren())n=Eb(i,e)||n;return n}function Eb(t,e){return 0==t.childCount&&(e.insertElement("paragraph",t),!0)}function Nb(t,e){e.view.document.registerPostFixer(n=>(function(t,e,n,i){let o=!1;const r=function(t){const e=Array.from(t._renderer.markedAttributes).filter(t=>!!t.parent).filter(Rb).filter(t=>Db(t.parent)),n=Array.from(t._renderer.markedChildren).filter(t=>!!t.parent).filter(Db).reduce((t,e)=>{const n=Array.from(e.getChildren()).filter(Rb);return [...t,...n]},[]);return [...e,...n]}(i);for(const e of r)o=Ob(e,n,t)||o;o&&function(t,e,n){const i=Array.from(t.getRanges()).map(t=>e.toViewRange(t));n.setSelection(i,{backward:t.isBackward});}(e.document.selection,n,t);return o})(n,t,e.mapper,e.view));}function Ob(t,e,n){const i=e.toModelElement(t),o=function(t,e){const n=t.childCount>1,i=!![...e.getAttributes()].length;return n||i?"p":"span"}(i.parent,i);if(t.name!==o){e.unbindViewElement(t);const r=n.rename(o,t);return e.bindElements(i,r),!0}return !1}function Rb(t){return t.is("p")||t.is("span")}function Db(t){return t.is("td")||t.is("th")}n(124);class Lb extends Nl{init(){const t=this.editor,e=t.model,n=e.schema,i=t.conversion;n.register("table",{allowWhere:"$block",allowAttributes:["headingRows","headingColumns"],isLimit:!0,isObject:!0}),n.register("tableRow",{allowIn:"table",isLimit:!0}),n.register("tableCell",{allowIn:"tableRow",allowAttributes:["colspan","rowspan"],isLimit:!0}),n.extend("$block",{allowIn:"tableCell"}),n.addChildCheck((t,e)=>{if("table"==e.name&&Array.from(t.getNames()).includes("table"))return !1}),n.addChildCheck((t,e)=>{if(Array.from(t.getNames()).includes("table"))return "image"!=e.name&&"media"!=e.name&&void 0}),i.for("upcast").add(zp()),i.for("editingDowncast").add($p({asWidget:!0})),i.for("dataDowncast").add($p()),i.for("upcast").add(Oa({model:"tableRow",view:"tr"})),i.for("editingDowncast").add(Gp({asWidget:!0})),i.for("dataDowncast").add(Gp()),i.for("downcast").add(t=>t.on("remove:tableRow",(t,e,n)=>{t.stop();const i=n.writer,o=n.mapper,r=o.toViewPosition(e.position).getLastMatchingPosition(t=>!t.item.is("tr")).nodeAfter,s=r.parent,a=i.createRangeOn(r),c=i.remove(a);for(const t of i.createRangeIn(c).getItems())o.unbindViewElement(t);s.childCount||i.remove(i.createRangeOn(s));},{priority:"higher"})),i.for("upcast").add(Bp("td")),i.for("upcast").add(Bp("th")),i.for("editingDowncast").add(Qp({asWidget:!0})),i.for("dataDowncast").add(Qp()),i.attributeToAttribute({model:"colspan",view:"colspan"}),i.attributeToAttribute({model:"rowspan",view:"rowspan"}),i.for("editingDowncast").add(Jp({asWidget:!0})),i.for("dataDowncast").add(Jp()),i.for("editingDowncast").add(Kp({asWidget:!0})),i.for("dataDowncast").add(Kp()),Nb(t.model,t.editing),t.commands.add("insertTable",new fb(t)),t.commands.add("insertTableRowAbove",new mb(t,{order:"above"})),t.commands.add("insertTableRowBelow",new mb(t,{order:"below"})),t.commands.add("insertTableColumnLeft",new gb(t,{order:"left"})),t.commands.add("insertTableColumnRight",new gb(t,{order:"right"})),t.commands.add("removeTableRow",new _b(t)),t.commands.add("removeTableColumn",new kb(t)),t.commands.add("splitTableCellVertically",new pb(t,{direction:"vertically"})),t.commands.add("splitTableCellHorizontally",new pb(t,{direction:"horizontally"})),t.commands.add("mergeTableCellRight",new bb(t,{direction:"right"})),t.commands.add("mergeTableCellLeft",new bb(t,{direction:"left"})),t.commands.add("mergeTableCellDown",new bb(t,{direction:"down"})),t.commands.add("mergeTableCellUp",new bb(t,{direction:"up"})),t.commands.add("setTableColumnHeader",new xb(t)),t.commands.add("setTableRowHeader",new vb(t)),Ab(e),Mb(e),this.editor.keystrokes.set("Tab",(...t)=>this._handleTabOnSelectedTable(...t),{priority:"low"}),this.editor.keystrokes.set("Tab",this._getTabHandler(!0),{priority:"low"}),this.editor.keystrokes.set("Shift+Tab",this._getTabHandler(!1),{priority:"low"});}static get requires(){return [lb]}_handleTabOnSelectedTable(t,e){const n=this.editor,i=n.model.document.selection;if(!i.isCollapsed&&1===i.rangeCount&&i.getFirstRange().isFlat){const t=i.getSelectedElement();if(!t||!t.is("table"))return;e(),n.model.change(e=>{e.setSelection(e.createRangeIn(t.getChild(0).getChild(0)));});}}_getTabHandler(t){const e=this.editor;return (n,i)=>{const o=Lp("tableCell",e.model.document.selection.getFirstPosition());if(!o)return;i();const r=o.parent,s=r.parent,a=s.getChildIndex(r),c=r.getChildIndex(o),l=0===c;if(!t&&l&&0===a)return;const d=c===r.childCount-1,u=a===s.childCount-1;let h;if(t&&u&&d&&e.plugins.get(lb).insertRows(s,{at:s.childCount}),t&&d){const t=s.getChild(a+1);h=t.getChild(0);}else if(!t&&l){const t=s.getChild(a-1);h=t.getChild(t.childCount-1);}else h=r.getChild(c+(t?1:-1));e.model.change(t=>{t.setSelection(t.createRangeIn(h));});}}}n(126);class jb extends yl{constructor(t){super(t);const e=this.bindTemplate;this.items=this.createCollection(),this.set("rows",0),this.set("columns",0),this.bind("label").to(this,"columns",this,"rows",(t,e)=>`${e} x ${t}`),this.setTemplate({tag:"div",attributes:{class:["ck"]},children:[{tag:"div",attributes:{class:["ck-insert-table-dropdown__grid"]},children:this.items},{tag:"div",attributes:{class:["ck-insert-table-dropdown__label"]},children:[{text:e.to("label")}]}],on:{mousedown:e.to(t=>{t.preventDefault();}),click:e.to(()=>{this.fire("execute");})}});for(let t=0;t<100;t++){const e=new Vb;e.on("over",()=>{const e=Math.floor(t/10),n=t%10;this.set("rows",e+1),this.set("columns",n+1);}),this.items.add(e);}this.on("change:columns",()=>{this._highlightGridBoxes();}),this.on("change:rows",()=>{this._highlightGridBoxes();});}focus(){}focusLast(){}_highlightGridBoxes(){const t=this.rows,e=this.columns;this.items.map((n,i)=>{const o=Math.floor(i/10)<t&&i%10<e;n.set("isOn",o);});}}class Vb extends yl{constructor(t){super(t);const e=this.bindTemplate;this.set("isOn",!1),this.setTemplate({tag:"div",attributes:{class:["ck-insert-table-dropdown-grid-box",e.if("isOn","ck-on")]},on:{mouseover:e.to("over")}});}}var zb=n(49),Bb=n.n(zb),Fb=n(50),Ub=n.n(Fb),Hb=n(51),qb=n.n(Hb),Wb=n(52),Yb=n.n(Wb);class $b extends Nl{init(){const t=this.editor,e=this.editor.t;t.ui.componentFactory.add("insertTable",n=>{const i=t.commands.get("insertTable"),o=nu(n);o.bind("isEnabled").to(i),o.buttonView.set({icon:Bb.a,label:e("am"),tooltip:!0});const r=new jb(n);return o.panelView.children.add(r),r.delegate("execute").to(o),o.buttonView.on("open",()=>{r.rows=0,r.columns=0;}),o.on("execute",()=>{t.execute("insertTable",{rows:r.rows,columns:r.columns}),t.editing.view.focus();}),o}),t.ui.componentFactory.add("tableColumn",t=>{const n=[{type:"switchbutton",model:{commandName:"setTableColumnHeader",label:e("an"),bindIsOn:!0}},{type:"separator"},{type:"button",model:{commandName:"insertTableColumnLeft",label:e("ao")}},{type:"button",model:{commandName:"insertTableColumnRight",label:e("ap")}},{type:"button",model:{commandName:"removeTableColumn",label:e("aq")}}];return this._prepareDropdown(e("ar"),Ub.a,n,t)}),t.ui.componentFactory.add("tableRow",t=>{const n=[{type:"switchbutton",model:{commandName:"setTableRowHeader",label:e("as"),bindIsOn:!0}},{type:"separator"},{type:"button",model:{commandName:"insertTableRowBelow",label:e("at")}},{type:"button",model:{commandName:"insertTableRowAbove",label:e("au")}},{type:"button",model:{commandName:"removeTableRow",label:e("av")}}];return this._prepareDropdown(e("aw"),qb.a,n,t)}),t.ui.componentFactory.add("mergeTableCells",t=>{const n=[{type:"button",model:{commandName:"mergeTableCellUp",label:e("ax")}},{type:"button",model:{commandName:"mergeTableCellRight",label:e("ay")}},{type:"button",model:{commandName:"mergeTableCellDown",label:e("az")}},{type:"button",model:{commandName:"mergeTableCellLeft",label:e("ba")}},{type:"separator"},{type:"button",model:{commandName:"splitTableCellVertically",label:e("bb")}},{type:"button",model:{commandName:"splitTableCellHorizontally",label:e("bc")}}];return this._prepareDropdown(e("bd"),Yb.a,n,t)});}_prepareDropdown(t,e,n,i){const o=this.editor,r=nu(i),s=[],a=new Xi;for(const t of n)Gb(t,o,s,a);return ou(r,a),r.buttonView.set({label:t,icon:e,tooltip:!0}),r.bind("isEnabled").toMany(s,"isEnabled",(...t)=>t.some(t=>t)),this.listenTo(r,"execute",t=>{o.execute(t.source.commandName),o.editing.view.focus();}),r}}function Gb(t,e,n,i){const o=t.model=new xu(t.model),{commandName:r,bindIsOn:s}=t.model;if("separator"!==t.type){const t=e.commands.get(r);n.push(t),o.set({commandName:r}),o.bind("isEnabled").to(t),s&&o.bind("isOn").to(t,"value");}o.set({withText:!0}),i.add(t);}n(128);n.d(e,"default",function(){return Qb});class Qb extends El{}Qb.builtinPlugins=[class extends Nl{static get requires(){return [Ll,Ul,Yl,ld,Dd]}static get pluginName(){return "Essentials"}},class extends Nl{static get requires(){return [Ud,mu]}static get pluginName(){return "Alignment"}},class extends Nl{static get requires(){return [yu,Tu]}static get pluginName(){return "FontSize"}},class extends Nl{static get requires(){return [Nu,Du]}static get pluginName(){return "FontFamily"}},class extends Nl{static get requires(){return [ju,Wu]}static get pluginName(){return "Highlight"}},eh,class extends Nl{static get pluginName(){return "Autoformat"}afterInit(){this._addListAutoformats(),this._addBasicStylesAutoformats(),this._addHeadingAutoformats(),this._addBlockQuoteAutoformats();}_addListAutoformats(){const t=this.editor.commands;t.get("bulletedList")&&new ih(this.editor,/^[*-]\s$/,"bulletedList"),t.get("numberedList")&&new ih(this.editor,/^\d+[.|)]\s$/,"numberedList");}_addBasicStylesAutoformats(){const t=this.editor.commands;t.get("bold")&&(new oh(this.editor,/(\*\*)([^*]+)(\*\*)$/g,"bold"),new oh(this.editor,/(__)([^_]+)(__)$/g,"bold")),t.get("italic")&&(new oh(this.editor,/(?:^|[^*])(\*)([^*_]+)(\*)$/g,"italic"),new oh(this.editor,/(?:^|[^_])(_)([^_]+)(_)$/g,"italic")),t.get("code")&&new oh(this.editor,/(`)([^`]+)(`)$/g,"code");}_addHeadingAutoformats(){const t=this.editor.commands.get("heading");t&&t.modelElements.filter(t=>t.match(/^heading[1-6]$/)).forEach(t=>{const e=t[7],n=new RegExp(`^(#{${e}})\\s$`);new ih(this.editor,n,()=>{this.editor.execute("heading",{value:t});});});}_addBlockQuoteAutoformats(){this.editor.commands.get("blockQuote")&&new ih(this.editor,/^>\s$/,"blockQuote");}},class extends Nl{static get requires(){return [ch,hh]}static get pluginName(){return "Bold"}},class extends Nl{static get requires(){return [mh,wh]}static get pluginName(){return "Italic"}},class extends Nl{static get requires(){return [kh,Ah]}static get pluginName(){return "Strikethrough"}},class extends Nl{static get requires(){return [Th,Ih]}static get pluginName(){return "Underline"}},class extends Nl{static get requires(){return [Dh,Vh]}static get pluginName(){return "BlockQuote"}},class extends Nl{static get pluginName(){return "CKFinder"}static get requires(){return [Wh,Fh,eh]}},class extends Nl{static get requires(){return [Xh,em,xm]}static get pluginName(){return "EasyImage"}},class extends Nl{static get requires(){return [Nm,Om]}static get pluginName(){return "Heading"}},em,class extends Nl{static get requires(){return [Bm]}static get pluginName(){return "ImageCaption"}},class extends Nl{static get requires(){return [rg,sg]}static get pluginName(){return "ImageStyle"}},class extends Nl{static get requires(){return [ag]}static get pluginName(){return "ImageToolbar"}afterInit(){const t=this.editor;t.plugins.get(ag).register("image",{items:t.config.get("image.toolbar")||[],visibleWhen:vf});}},xm,class extends Nl{static get requires(){return [Cg,Lg]}static get pluginName(){return "Link"}},class extends Nl{static get requires(){return [rp,up]}static get pluginName(){return "List"}},class extends Nl{static get requires(){return [xp,Sp,Cp,If]}static get pluginName(){return "MediaEmbed"}},Tm,class extends Nl{static get pluginName(){return "PasteFromOffice"}init(){const t=this.editor;this.listenTo(t.plugins.get(Ll),"inputTransformation",(t,e)=>{const n=e.dataTransfer.getData("text/html");!0!==e.pasteFromOfficeProcessed&&function(t){return !(!t||!t.match(/<meta\s*name="?generator"?\s*content="?microsoft\s*word\s*\d+"?\/?>/gi)&&!t.match(/xmlns:o="urn:schemas-microsoft-com/gi))}(n)&&(e.content=this._normalizeWordInput(n,e.dataTransfer),e.pasteFromOfficeProcessed=!0);},{priority:"high"});}_normalizeWordInput(t,e){const{body:n,stylesString:i}=Ep(t);return Np(n,i),Rp(n,e.getData("text/rtf")),n}},class extends Nl{static get requires(){return [Lb,$b,If]}static get pluginName(){return "Table"}},class extends Nl{static get requires(){return [ag]}static get pluginName(){return "TableToolbar"}afterInit(){const t=this.editor,e=t.plugins.get(ag),n=t.config.get("table.contentToolbar"),i=t.config.get("table.toolbar"),o=t.config.get("table.tableToolbar");i&&console.warn("`config.table.toolbar` is deprecated and will be removed in the next major release. Use `config.table.contentToolbar` instead."),(n||i)&&e.register("tableContent",{items:n||i,visibleWhen:Yp}),o&&e.register("table",{items:o,visibleWhen:Wp});}}],Qb.defaultConfig={toolbar:{items:["heading","|","fontsize","fontfamily","|","bold","italic","underline","strikethrough","highlight","|","alignment","|","numberedList","bulletedList","|","link","blockquote","imageUpload","insertTable","mediaEmbed","|","undo","redo"]},image:{styles:["full","alignLeft","alignRight"],toolbar:["imageStyle:alignLeft","imageStyle:full","imageStyle:alignRight","|","imageTextAlternative"]},table:{contentToolbar:["tableColumn","tableRow","mergeTableCells"]},language:"en"};}]).default});
	//# sourceMappingURL=ckeditor.js.map
	});

	var DecoupledEditor = unwrapExports(ckeditor);
	var ckeditor_1 = ckeditor.DecoupledEditor;

	/* ui\tags\Icon.html generated by Svelte v2.16.1 */

	const file = "ui\\tags\\Icon.html";

	function create_main_fragment(component, ctx) {
		var i, slot_content_default = component._slotted.default, current;

		return {
			c: function create() {
				i = createElement("i");
				i.className = "material-icons";
				addLoc(i, file, 0, 0, 0);
			},

			m: function mount(target, anchor) {
				insert(target, i, anchor);

				if (slot_content_default) {
					append(i, slot_content_default);
				}

				current = true;
			},

			p: noop,

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(i);
				}

				if (slot_content_default) {
					reinsertChildren(i, slot_content_default);
				}
			}
		};
	}

	function Icon(options) {
		this._debugName = '<Icon>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign({}, options.data);
		this._intro = !!options.intro;

		this._slotted = options.slots || {};

		this._fragment = create_main_fragment(this, this._state);

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);
		}

		this._intro = true;
	}

	assign(Icon.prototype, protoDev);

	Icon.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\tags\Loading.html generated by Svelte v2.16.1 */

	function data(e) {
		return {small: false, big: false};
	}

	const file$1 = "ui\\tags\\Loading.html";

	function create_main_fragment$1(component, ctx) {
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
				addLoc(div0, file$1, 4, 12, 246);
				div1.className = "circle-clipper left";
				addLoc(div1, file$1, 3, 8, 199);
				div2.className = "circle";
				addLoc(div2, file$1, 6, 12, 325);
				div3.className = "gap-patch";
				addLoc(div3, file$1, 5, 14, 288);
				div4.className = "circle";
				addLoc(div4, file$1, 8, 12, 415);
				div5.className = "circle-clipper right";
				addLoc(div5, file$1, 7, 14, 367);
				div6.className = "spinner-layer spinner-yellow-only";
				addLoc(div6, file$1, 2, 8, 142);
				div7.className = div7_class_value = "preloader-wrapper " + (ctx.small ? "small" : ctx.big ? "big" : "") + " active";
				addLoc(div7, file$1, 1, 4, 57);
				div8.className = "center-align";
				setStyle(div8, "padding-top", "25%");
				addLoc(div8, file$1, 0, 0, 0);
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

		this._fragment = create_main_fragment$1(this, this._state);

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
	const file$2 = "ui\\tags\\Imgl.html";

	function create_main_fragment$2(component, ctx) {
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
				addLoc(img, file$2, 3, 4, 48);
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

		this._fragment = create_main_fragment$2(this, this._state);

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
	const file$3 = "ui\\tags\\Card.html";

	function create_main_fragment$3(component, ctx) {
		var div1, text, div0, slot_content_default = component._slotted.default, div1_class_value, current;

		var if_block = (ctx.image) && create_if_block$1(component, ctx);

		return {
			c: function create() {
				div1 = createElement("div");
				if (if_block) if_block.c();
				text = createText("\r\n\t");
				div0 = createElement("div");
				div0.className = "card-content";
				addLoc(div0, file$3, 15, 1, 438);
				div1.className = div1_class_value = "card white " + (ctx.static ? "z-depth-3" : "hoverable") + " " + (ctx.col ? "col" : "") + " " + ctx.col;
				addLoc(div1, file$3, 9, 0, 229);
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
				addLoc(div, file$3, 11, 8, 340);
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

		this._fragment = create_main_fragment$3(this, this._state);

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

	/* ui\tags\Modal.html generated by Svelte v2.16.1 */

	function data$3() {
	    return {
	        id: "modal",
	        nobtn: false,
	        buttons: [function OK(comp){}]
	    }
	}
	var methods = {
	    click(i) {
	        const { buttons, id } = this.get();
	        buttons[i](this);
	    },
	    close() {
	        const { id } = this.get();
	        M.Modal.getInstance(document.getElementById(id)).close();
	    },
	    open() {
	        const { id } = this.get();
	        M.Modal.getInstance(document.getElementById(id)).open();
	    }
	};

	function onupdate({changed}) {
	    if(changed.id) {
	        var elems = document.querySelector('.modal');
	        var instances = M.Modal.init(elems, {});
	    }
	}
	const file$4 = "ui\\tags\\Modal.html";

	function click_handler(event) {
		const { component, ctx } = this._svelte;

		component.click(ctx.i);
	}

	function get_each_context(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.btn = list[i];
		child_ctx.i = i;
		return child_ctx;
	}

	function create_main_fragment$4(component, ctx) {
		var text0, div2, div0, slot_content_default = component._slotted.default, text1, div1, current;

		var if_block = (!ctx.nobtn) && create_if_block$2(component, ctx);

		var each_value = ctx.buttons;

		var each_blocks = [];

		for (var i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block(component, get_each_context(ctx, each_value, i));
		}

		return {
			c: function create() {
				if (if_block) if_block.c();
				text0 = createText("\r\n");
				div2 = createElement("div");
				div0 = createElement("div");
				text1 = createText("\r\n    ");
				div1 = createElement("div");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}
				div0.className = "modal-content";
				addLoc(div0, file$4, 17, 4, 639);
				div1.className = "modal-footer";
				addLoc(div1, file$4, 22, 4, 763);
				div2.id = ctx.id;
				div2.className = "modal";
				addLoc(div2, file$4, 16, 0, 604);
			},

			m: function mount(target, anchor) {
				if (if_block) if_block.m(target, anchor);
				insert(target, text0, anchor);
				insert(target, div2, anchor);
				append(div2, div0);

				if (slot_content_default) {
					append(div0, slot_content_default);
				}

				append(div2, text1);
				append(div2, div1);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(div1, null);
				}

				current = true;
			},

			p: function update(changed, ctx) {
				if (!ctx.nobtn) {
					if (if_block) {
						if_block.p(changed, ctx);
					} else {
						if_block = create_if_block$2(component, ctx);
						if_block.c();
						if_block.m(text0.parentNode, text0);
					}
				} else if (if_block) {
					if_block.d(1);
					if_block = null;
				}

				if (changed.buttons) {
					each_value = ctx.buttons;

					for (var i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(div1, null);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value.length;
				}

				if (changed.id) {
					div2.id = ctx.id;
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (if_block) if_block.d(detach);
				if (detach) {
					detachNode(text0);
					detachNode(div2);
				}

				if (slot_content_default) {
					reinsertChildren(div0, slot_content_default);
				}

				destroyEach(each_blocks, detach);
			}
		};
	}

	// (14:0) {#if !nobtn}
	function create_if_block$2(component, ctx) {
		var button, text;

		return {
			c: function create() {
				button = createElement("button");
				text = createText(ctx.id);
				button.dataset.target = ctx.id;
				button.className = "btn waves-effect waves-light black-text yellow modal-trigger";
				addLoc(button, file$4, 14, 4, 486);
			},

			m: function mount(target, anchor) {
				insert(target, button, anchor);
				append(button, text);
			},

			p: function update(changed, ctx) {
				if (changed.id) {
					setData(text, ctx.id);
					button.dataset.target = ctx.id;
				}
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(button);
				}
			}
		};
	}

	// (24:8) {#each buttons as btn, i}
	function create_each_block(component, ctx) {
		var a, text_value = ctx.btn.name, text;

		return {
			c: function create() {
				a = createElement("a");
				text = createText(text_value);
				a._svelte = { component, ctx };

				addListener(a, "click", click_handler);
				a.className = "modal-close waves-effect waves-light black-text yellow btn-flat";
				addLoc(a, file$4, 24, 12, 838);
			},

			m: function mount(target, anchor) {
				insert(target, a, anchor);
				append(a, text);
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				if ((changed.buttons) && text_value !== (text_value = ctx.btn.name)) {
					setData(text, text_value);
				}

				a._svelte.ctx = ctx;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(a);
				}

				removeListener(a, "click", click_handler);
			}
		};
	}

	function Modal(options) {
		this._debugName = '<Modal>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data$3(), options.data);
		if (!('nobtn' in this._state)) console.warn("<Modal> was created without expected data property 'nobtn'");
		if (!('id' in this._state)) console.warn("<Modal> was created without expected data property 'id'");
		if (!('buttons' in this._state)) console.warn("<Modal> was created without expected data property 'buttons'");
		this._intro = !!options.intro;
		this._handlers.update = [onupdate];

		this._slotted = options.slots || {};

		this._fragment = create_main_fragment$4(this, this._state);

		this.root._oncreate.push(() => {
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

	assign(Modal.prototype, protoDev);
	assign(Modal.prototype, methods);

	Modal.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\tags\Input.html generated by Svelte v2.16.1 */

	function data$4() {
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
	const file$5 = "ui\\tags\\Input.html";

	function create_main_fragment$5(component, ctx) {
		var div, input, input_class_value, input_disabled_value, text0, text1, div_class_value, current;

		var if_block0 = (ctx.label) && create_if_block_1(component, ctx);

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
				addLoc(input, file$5, 1, 1, 54);
				div.className = div_class_value = "input-field " + (ctx.col ? "col" : "") + " " + ctx.col;
				addLoc(div, file$5, 0, 0, 0);
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
						if_block0 = create_if_block_1(component, ctx);
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
	function create_if_block_1(component, ctx) {
		var label, text;

		return {
			c: function create() {
				label = createElement("label");
				text = createText(ctx.label);
				label.htmlFor = ctx.id;
				addLoc(label, file$5, 3, 8, 248);
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
				addLoc(span, file$5, 6, 5, 315);
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
		this._state = assign(data$4(), options.data);
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

		this._fragment = create_main_fragment$5(this, this._state);

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

	/* ui\tags\Form.html generated by Svelte v2.16.1 */

	const file$6 = "ui\\tags\\Form.html";

	function create_main_fragment$6(component, ctx) {
		var div1, text, form, div0, slot_content_default = component._slotted.default, current;

		var if_block = (ctx.response) && create_if_block$4(component, ctx);

		return {
			c: function create() {
				div1 = createElement("div");
				if (if_block) if_block.c();
				text = createText("\r\n    \r\n    ");
				form = createElement("form");
				div0 = createElement("div");
				div0.className = "row";
				addLoc(div0, file$6, 11, 8, 333);
				form.className = "col s12";
				addLoc(form, file$6, 10, 4, 301);
				div1.className = "row";
				addLoc(div1, file$6, 0, 0, 0);
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
						if_block = create_if_block$4(component, ctx);
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
	function create_if_block$4(component, ctx) {
		var if_block_anchor;

		function select_block_type(ctx) {
			if (!ctx.response.err) return create_if_block_1$1;
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
				addLoc(span, file$6, 6, 12, 185);
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
	function create_if_block_1$1(component, ctx) {
		var span;

		return {
			c: function create() {
				span = createElement("span");
				span.textContent = "Done !";
				span.className = "new badge green left";
				span.dataset.badgeCaption = " ";
				addLoc(span, file$6, 4, 12, 83);
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

		this._fragment = create_main_fragment$6(this, this._state);

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

	/* ui\panel\admin_pages\SecurityPolicy.html generated by Svelte v2.16.1 */

	function data$5() {
	  const user = window.cdsuser;
	  return {
	    user,
	    changeInfo: null
	  };
	}
	var methods$1 = {
	  logout() {
	    utils.fetch("/auth/logout",).catch(err => utils.toast("can't log out !"));
	  },
	  updateUser() {
	    const elemail = document.getElementById("email");
	    const elfirst = document.getElementById("firstname");
	    const ellast = document.getElementById("lastname");
	    const elpassword = document.getElementById("password");
	    const elconfirm = document.getElementById("confirm");

	    const email = elemail.value ? elemail.value : null;
	    const firstname = elfirst.value ? elfirst.value : null;
	    const lastname = ellast.value ? ellast.value : null;
	    var password = elpassword.value == elconfirm.value ? elpassword.value : {err: true};
	    if(password.err) {
	      utils.toast("passwords don't match");
	      return;
	    }    password = password ? password : null;
	    utils
	      .fetch("/user/update", { email, firstname, lastname, password })
	      .then(res => {
	          if(res.status != 200)
	              throw "not ok";
	          else
	             utils.toast("Done");
	             utils.reload();
	      })
	      .catch(err => utils.toast("something went wrong !"));
	  },
	  uploadAvatar() {
	    utils
	      .upload("/user/avatar", "avatarpicker")
	      .then(res => {
	          if(res.status != 200)
	              throw "not ok";
	          else
	             utils.toast("Done");
	             utils.reload();
	      })
	      .catch(err => utils.toast("something went wrong !"));
	  }
	};

	const file$7 = "ui\\panel\\admin_pages\\SecurityPolicy.html";

	function create_main_fragment$7(component, ctx) {
		var div0, h40, text0, text1_value = ctx.user.firstname ? ctx.user.firstname : "", text1, text2, text3, p0, span0, text4, text5, span1, text7, br0, text8, h41, text10, p1, text11_value = ctx.user.firstname, text11, text12, text13_value = ctx.user.lastname, text13, text14, text15_value = ctx.user.access === 2 ? "user" : ctx.user.access === 3 ? "mod" : ctx.user.access === 5 ? "admin" : ctx.user.access === 7 ? "dev" : "WHO ARE YOU ?! ", text15, text16, button0, text18, div1, h42, text20, p2, span2, text21, text22, br1, text23, text24, text25, text26, text27, text28, button1, form_updating = {}, text30, div5, h43, span3, text31, text32, text33, div4, div2, span4, text35, input5, text36, div3, input6, text37, button2, current;

		var i0 = new Icon({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() }
		});

		var modal_initial_data = { id: "who am i", buttons: [function Agree(c) {ctx.console.log(c);}] };
		var modal = new Modal({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: modal_initial_data
		});

		function click_handler(event) {
			component.logout();
		}

		var card0_initial_data = {
		 	image: "/user/avatar",
		 	col: "s12 m10 offset-m1 l8 offset-l2"
		 };
		var card0 = new Card({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: card0_initial_data
		});

		var i1 = new Icon({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() }
		});

		var input0_initial_data = {
		 	id: "email",
		 	label: "email",
		 	type: "email",
		 	validate: true,
		 	col: "s9"
		 };
		var input0 = new Input({
			root: component.root,
			store: component.store,
			data: input0_initial_data
		});

		var input1_initial_data = {
		 	id: "firstname",
		 	label: "first name",
		 	type: "text",
		 	validate: true,
		 	col: "s9"
		 };
		var input1 = new Input({
			root: component.root,
			store: component.store,
			data: input1_initial_data
		});

		var input2_initial_data = {
		 	id: "lastname",
		 	label: "last name",
		 	type: "text",
		 	validate: true,
		 	col: "s9"
		 };
		var input2 = new Input({
			root: component.root,
			store: component.store,
			data: input2_initial_data
		});

		var input3_initial_data = {
		 	id: "password",
		 	label: "password",
		 	type: "password",
		 	validate: true,
		 	col: "s9"
		 };
		var input3 = new Input({
			root: component.root,
			store: component.store,
			data: input3_initial_data
		});

		var input4_initial_data = {
		 	id: "confirm",
		 	label: "confirm",
		 	type: "password",
		 	validate: true,
		 	col: "s9"
		 };
		var input4 = new Input({
			root: component.root,
			store: component.store,
			data: input4_initial_data
		});

		function click_handler_1(event) {
			component.updateUser();
		}

		var form_initial_data = {};
		if (ctx.changeInfo !== void 0) {
			form_initial_data.response = ctx.changeInfo;
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
					newState.changeInfo = childState.response;
				}
				component._set(newState);
				form_updating = {};
			}
		});

		component.root._beforecreate.push(() => {
			form._bind({ response: 1 }, form.get());
		});

		var card1_initial_data = { col: "s12 m10 offset-m1 l8 offset-l2" };
		var card1 = new Card({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: card1_initial_data
		});

		var i2 = new Icon({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() }
		});

		function click_handler_2(event) {
			component.uploadAvatar();
		}

		var card2_initial_data = { col: "s12 m10 offset-m1 l8 offset-l2" };
		var card2 = new Card({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: card2_initial_data
		});

		return {
			c: function create() {
				div0 = createElement("div");
				h40 = createElement("h4");
				text0 = createText("Hello ");
				text1 = createText(text1_value);
				text2 = createText(" !");
				text3 = createText("\r\n\t\t");
				p0 = createElement("p");
				span0 = createElement("span");
				text4 = createText("format_quote");
				i0._fragment.c();
				text5 = createText(" Here you can use ");
				span1 = createElement("span");
				span1.textContent = "WHO AM I";
				text7 = createText(" button\r\n\t\t\tto check your identity!");
				br0 = createElement("br");
				text8 = createText("\r\n\t\t");
				h41 = createElement("h4");
				h41.textContent = "You are";
				text10 = createText("\r\n\t\t\t");
				p1 = createElement("p");
				text11 = createText(text11_value);
				text12 = createText(" ");
				text13 = createText(text13_value);
				text14 = createText(" the ");
				text15 = createText(text15_value);
				modal._fragment.c();
				text16 = createText("\r\n\t\t");
				button0 = createElement("button");
				button0.textContent = "log me out!";
				card0._fragment.c();
				text18 = createText("\r\n");
				div1 = createElement("div");
				h42 = createElement("h4");
				h42.textContent = "Your account.";
				text20 = createText("\r\n\t\t");
				p2 = createElement("p");
				span2 = createElement("span");
				text21 = createText("format_quote");
				i1._fragment.c();
				text22 = createText(" Feel free and make some changes to your info.");
				br1 = createElement("br");
				text23 = createText("\r\n\t\t");
				input0._fragment.c();
				text24 = createText("\r\n\t\t\t");
				input1._fragment.c();
				text25 = createText("\r\n\t\t\t");
				input2._fragment.c();
				text26 = createText("\r\n\t\t\t");
				input3._fragment.c();
				text27 = createText("\r\n\t\t\t");
				input4._fragment.c();
				text28 = createText("\r\n\t\t\t");
				button1 = createElement("button");
				button1.textContent = "update";
				form._fragment.c();
				card1._fragment.c();
				text30 = createText("\r\n");
				div5 = createElement("div");
				h43 = createElement("h4");
				span3 = createElement("span");
				text31 = createText("format_quote");
				i2._fragment.c();
				text32 = createText(" Change your avatar.");
				text33 = createText("\r\n\t\t");
				div4 = createElement("div");
				div2 = createElement("div");
				span4 = createElement("span");
				span4.textContent = "image";
				text35 = createText("\r\n\t\t\t\t");
				input5 = createElement("input");
				text36 = createText("\r\n\t\t\t");
				div3 = createElement("div");
				input6 = createElement("input");
				text37 = createText("\r\n        ");
				button2 = createElement("button");
				button2.textContent = "upload";
				card2._fragment.c();
				addLoc(h40, file$7, 2, 2, 88);
				span0.className = "red-text";
				addLoc(span0, file$7, 3, 5, 150);
				span1.className = "red-text";
				addLoc(span1, file$7, 3, 72, 217);
				addLoc(p0, file$7, 3, 2, 147);
				addLoc(br0, file$7, 4, 30, 294);
				addLoc(h41, file$7, 6, 3, 375);
				addLoc(p1, file$7, 7, 3, 396);
				addListener(button0, "click", click_handler);
				button0.className = "btn white red-text waves-effect waves-gray";
				addLoc(button0, file$7, 9, 2, 590);
				div0.className = "row";
				addLoc(div0, file$7, 0, 0, 0);
				addLoc(h42, file$7, 14, 2, 774);
				span2.className = "red-text";
				addLoc(span2, file$7, 15, 5, 803);
				addLoc(br1, file$7, 15, 100, 898);
				addLoc(p2, file$7, 15, 2, 800);
				addListener(button1, "click", click_handler_1);
				button1.className = "btn waves-effect waves-light yellow black-text col s4";
				addLoc(button1, file$7, 22, 3, 1326);
				div1.className = "row";
				addLoc(div1, file$7, 12, 0, 707);
				span3.className = "red-text";
				addLoc(span3, file$7, 28, 6, 1535);
				addLoc(h43, file$7, 28, 2, 1531);
				addLoc(span4, file$7, 31, 4, 1720);
				input5.id = "avatarpicker";
				setAttribute(input5, "type", "file");
				addLoc(input5, file$7, 32, 4, 1744);
				div2.className = "btn waves-effect waves-light black-text yellow";
				addLoc(div2, file$7, 30, 3, 1654);
				input6.className = "file-path validate";
				setAttribute(input6, "type", "text");
				addLoc(input6, file$7, 35, 4, 1834);
				div3.className = "file-path-wrapper";
				addLoc(div3, file$7, 34, 3, 1797);
				div4.className = "file-field input-field";
				addLoc(div4, file$7, 29, 2, 1613);
				addListener(button2, "click", click_handler_2);
				button2.className = "btn waves-effect waves-light black-text yellow submit";
				addLoc(button2, file$7, 38, 8, 1911);
				div5.className = "row";
				addLoc(div5, file$7, 26, 0, 1464);
			},

			m: function mount(target, anchor) {
				insert(target, div0, anchor);
				append(card0._slotted.default, h40);
				append(h40, text0);
				append(h40, text1);
				append(h40, text2);
				append(card0._slotted.default, text3);
				append(card0._slotted.default, p0);
				append(p0, span0);
				append(i0._slotted.default, text4);
				i0._mount(span0, null);
				append(p0, text5);
				append(p0, span1);
				append(p0, text7);
				append(card0._slotted.default, br0);
				append(card0._slotted.default, text8);
				append(modal._slotted.default, h41);
				append(modal._slotted.default, text10);
				append(modal._slotted.default, p1);
				append(p1, text11);
				append(p1, text12);
				append(p1, text13);
				append(p1, text14);
				append(p1, text15);
				modal._mount(card0._slotted.default, null);
				append(card0._slotted.default, text16);
				append(card0._slotted.default, button0);
				card0._mount(div0, null);
				insert(target, text18, anchor);
				insert(target, div1, anchor);
				append(card1._slotted.default, h42);
				append(card1._slotted.default, text20);
				append(card1._slotted.default, p2);
				append(p2, span2);
				append(i1._slotted.default, text21);
				i1._mount(span2, null);
				append(p2, text22);
				append(p2, br1);
				append(card1._slotted.default, text23);
				input0._mount(form._slotted.default, null);
				append(form._slotted.default, text24);
				input1._mount(form._slotted.default, null);
				append(form._slotted.default, text25);
				input2._mount(form._slotted.default, null);
				append(form._slotted.default, text26);
				input3._mount(form._slotted.default, null);
				append(form._slotted.default, text27);
				input4._mount(form._slotted.default, null);
				append(form._slotted.default, text28);
				append(form._slotted.default, button1);
				form._mount(card1._slotted.default, null);
				card1._mount(div1, null);
				insert(target, text30, anchor);
				insert(target, div5, anchor);
				append(card2._slotted.default, h43);
				append(h43, span3);
				append(i2._slotted.default, text31);
				i2._mount(span3, null);
				append(h43, text32);
				append(card2._slotted.default, text33);
				append(card2._slotted.default, div4);
				append(div4, div2);
				append(div2, span4);
				append(div2, text35);
				append(div2, input5);
				append(div4, text36);
				append(div4, div3);
				append(div3, input6);
				append(card2._slotted.default, text37);
				append(card2._slotted.default, button2);
				card2._mount(div5, null);
				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				if ((!current || changed.user) && text1_value !== (text1_value = ctx.user.firstname ? ctx.user.firstname : "")) {
					setData(text1, text1_value);
				}

				if ((!current || changed.user) && text11_value !== (text11_value = ctx.user.firstname)) {
					setData(text11, text11_value);
				}

				if ((!current || changed.user) && text13_value !== (text13_value = ctx.user.lastname)) {
					setData(text13, text13_value);
				}

				if ((!current || changed.user) && text15_value !== (text15_value = ctx.user.access === 2 ? "user" : ctx.user.access === 3 ? "mod" : ctx.user.access === 5 ? "admin" : ctx.user.access === 7 ? "dev" : "WHO ARE YOU ?! ")) {
					setData(text15, text15_value);
				}

				var modal_changes = {};
				if (changed.console) modal_changes.buttons = [function Agree(c) {ctx.console.log(c);}];
				modal._set(modal_changes);

				var form_changes = {};
				if (!form_updating.response && changed.changeInfo) {
					form_changes.response = ctx.changeInfo;
					form_updating.response = ctx.changeInfo !== void 0;
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

				outrocallback = callAfter(outrocallback, 13);

				if (i0) i0._fragment.o(outrocallback);
				if (modal) modal._fragment.o(outrocallback);
				if (card0) card0._fragment.o(outrocallback);
				if (i1) i1._fragment.o(outrocallback);
				if (input0) input0._fragment.o(outrocallback);
				if (input1) input1._fragment.o(outrocallback);
				if (input2) input2._fragment.o(outrocallback);
				if (input3) input3._fragment.o(outrocallback);
				if (input4) input4._fragment.o(outrocallback);
				if (form) form._fragment.o(outrocallback);
				if (card1) card1._fragment.o(outrocallback);
				if (i2) i2._fragment.o(outrocallback);
				if (card2) card2._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div0);
				}

				i0.destroy();
				modal.destroy();
				removeListener(button0, "click", click_handler);
				card0.destroy();
				if (detach) {
					detachNode(text18);
					detachNode(div1);
				}

				i1.destroy();
				input0.destroy();
				input1.destroy();
				input2.destroy();
				input3.destroy();
				input4.destroy();
				removeListener(button1, "click", click_handler_1);
				form.destroy();
				card1.destroy();
				if (detach) {
					detachNode(text30);
					detachNode(div5);
				}

				i2.destroy();
				removeListener(button2, "click", click_handler_2);
				card2.destroy();
			}
		};
	}

	function SecurityPolicy(options) {
		this._debugName = '<SecurityPolicy>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(assign({ console : console }, data$5()), options.data);
		if (!('user' in this._state)) console.warn("<SecurityPolicy> was created without expected data property 'user'");

		if (!('changeInfo' in this._state)) console.warn("<SecurityPolicy> was created without expected data property 'changeInfo'");
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$7(this, this._state);

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}

		this._intro = true;
	}

	assign(SecurityPolicy.prototype, protoDev);
	assign(SecurityPolicy.prototype, methods$1);

	SecurityPolicy.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\tags\Pagination.html generated by Svelte v2.16.1 */

	function plist({pages}) {
	    var li = [];
	    for(var i = 1; i <= pages; i++) {
	        li[i] = i;
	    }
	    return li;
	}

	function data$6() {
	    return {
	        pages: 5,
	        page: 1
	    }
	}
	var methods$2 = {
	    next() {
	        var {page, pages} = this.get();
	        page ++;
	        if(page > pages) {
	            page = pages;
	        }
	        this.set({page});
	    },
	    prev() {
	        var {page, pages} = this.get();
	        page --;
	        if(page < 1) {
	            page = 1;
	        }
	        this.set({page});
	    },
	    goto(page) {
	        this.set({page});
	    },
	};

	const file$8 = "ui\\tags\\Pagination.html";

	function click_handler$1(event) {
		const { component, ctx } = this._svelte;

		component.goto(ctx.p);
	}

	function get_each_context$1(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.p = list[i];
		return child_ctx;
	}

	function create_main_fragment$8(component, ctx) {
		var ul, li0, a0, text0, li0_class_value, text1, text2, li1, a1, text3, li1_class_value, current;

		var i0 = new Icon({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() }
		});

		function click_handler(event) {
			component.prev();
		}

		var each_value = ctx.plist;

		var each_blocks = [];

		for (var i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block$1(component, get_each_context$1(ctx, each_value, i));
		}

		var i1 = new Icon({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() }
		});

		function click_handler_1(event) {
			component.next();
		}

		return {
			c: function create() {
				ul = createElement("ul");
				li0 = createElement("li");
				a0 = createElement("a");
				text0 = createText("chevron_left");
				i0._fragment.c();
				text1 = createText("\r\n    ");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				text2 = createText("\r\n    ");
				li1 = createElement("li");
				a1 = createElement("a");
				text3 = createText("chevron_right");
				i1._fragment.c();
				addListener(a0, "click", click_handler);
				addLoc(a0, file$8, 10, 59, 272);
				li0.className = li0_class_value = ctx.page === 1 ? "disabled" : "waves-effect";
				addLoc(li0, file$8, 10, 4, 217);
				addListener(a1, "click", click_handler_1);
				addLoc(a1, file$8, 20, 63, 679);
				li1.className = li1_class_value = ctx.page === ctx.pages ? "disabled" : "waves-effect";
				addLoc(li1, file$8, 20, 4, 620);
				ul.className = "pagination";
				addLoc(ul, file$8, 9, 0, 188);
			},

			m: function mount(target, anchor) {
				insert(target, ul, anchor);
				append(ul, li0);
				append(li0, a0);
				append(i0._slotted.default, text0);
				i0._mount(a0, null);
				append(ul, text1);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(ul, null);
				}

				append(ul, text2);
				append(ul, li1);
				append(li1, a1);
				append(i1._slotted.default, text3);
				i1._mount(a1, null);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((!current || changed.page) && li0_class_value !== (li0_class_value = ctx.page === 1 ? "disabled" : "waves-effect")) {
					li0.className = li0_class_value;
				}

				if (changed.plist || changed.page) {
					each_value = ctx.plist;

					for (var i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context$1(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block$1(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(ul, text2);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value.length;
				}

				if ((!current || changed.page || changed.pages) && li1_class_value !== (li1_class_value = ctx.page === ctx.pages ? "disabled" : "waves-effect")) {
					li1.className = li1_class_value;
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 2);

				if (i0) i0._fragment.o(outrocallback);
				if (i1) i1._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(ul);
				}

				i0.destroy();
				removeListener(a0, "click", click_handler);

				destroyEach(each_blocks, detach);

				i1.destroy();
				removeListener(a1, "click", click_handler_1);
			}
		};
	}

	// (13:8) {#if p}
	function create_if_block$5(component, ctx) {
		var if_block_anchor;

		function select_block_type(ctx) {
			if (ctx.p !== ctx.page) return create_if_block_1$2;
			return create_else_block$2;
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

	// (16:12) {:else}
	function create_else_block$2(component, ctx) {
		var li, a, text_value = ctx.p, text;

		return {
			c: function create() {
				li = createElement("li");
				a = createElement("a");
				text = createText(text_value);
				a.className = "yellow";
				addLoc(a, file$8, 16, 35, 537);
				li.className = "active";
				addLoc(li, file$8, 16, 16, 518);
			},

			m: function mount(target, anchor) {
				insert(target, li, anchor);
				append(li, a);
				append(a, text);
			},

			p: function update(changed, ctx) {
				if ((changed.plist) && text_value !== (text_value = ctx.p)) {
					setData(text, text_value);
				}
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(li);
				}
			}
		};
	}

	// (14:12) {#if p !== page}
	function create_if_block_1$2(component, ctx) {
		var li, a, text_value = ctx.p, text;

		return {
			c: function create() {
				li = createElement("li");
				a = createElement("a");
				text = createText(text_value);
				a._svelte = { component, ctx };

				addListener(a, "click", click_handler$1);
				a.className = "white";
				addLoc(a, file$8, 14, 41, 433);
				li.className = "waves-effect";
				addLoc(li, file$8, 14, 16, 408);
			},

			m: function mount(target, anchor) {
				insert(target, li, anchor);
				append(li, a);
				append(a, text);
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				if ((changed.plist) && text_value !== (text_value = ctx.p)) {
					setData(text, text_value);
				}

				a._svelte.ctx = ctx;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(li);
				}

				removeListener(a, "click", click_handler$1);
			}
		};
	}

	// (12:4) {#each plist as p}
	function create_each_block$1(component, ctx) {
		var if_block_anchor;

		var if_block = (ctx.p) && create_if_block$5(component, ctx);

		return {
			c: function create() {
				if (if_block) if_block.c();
				if_block_anchor = createComment();
			},

			m: function mount(target, anchor) {
				if (if_block) if_block.m(target, anchor);
				insert(target, if_block_anchor, anchor);
			},

			p: function update(changed, ctx) {
				if (ctx.p) {
					if (if_block) {
						if_block.p(changed, ctx);
					} else {
						if_block = create_if_block$5(component, ctx);
						if_block.c();
						if_block.m(if_block_anchor.parentNode, if_block_anchor);
					}
				} else if (if_block) {
					if_block.d(1);
					if_block = null;
				}
			},

			d: function destroy$$1(detach) {
				if (if_block) if_block.d(detach);
				if (detach) {
					detachNode(if_block_anchor);
				}
			}
		};
	}

	function Pagination(options) {
		this._debugName = '<Pagination>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data$6(), options.data);

		this._recompute({ pages: 1 }, this._state);
		if (!('pages' in this._state)) console.warn("<Pagination> was created without expected data property 'pages'");
		if (!('page' in this._state)) console.warn("<Pagination> was created without expected data property 'page'");
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$8(this, this._state);

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}

		this._intro = true;
	}

	assign(Pagination.prototype, protoDev);
	assign(Pagination.prototype, methods$2);

	Pagination.prototype._checkReadOnly = function _checkReadOnly(newState) {
		if ('plist' in newState && !this._updatingReadonlyProperty) throw new Error("<Pagination>: Cannot set read-only property 'plist'");
	};

	Pagination.prototype._recompute = function _recompute(changed, state) {
		if (changed.pages) {
			if (this._differs(state.plist, (state.plist = plist(state)))) changed.plist = true;
		}
	};

	/* ui\tags\Search.html generated by Svelte v2.16.1 */

	function data$7() {
	    return {
	        data: {},
	        by: ["name"],
	        col: null,
	        icon: "search",
	        label: "search",
	        id: "autocomplete-input"
	    }
	}
	var methods$3 = {
	    key(e) {
	        const {data, id, by} = this.get();
	        if(e.keyCode === 13) {
	            var key = document.getElementById(id).value;
	            var found = false;
	            for(var b of by) {
	                var done = false;
	                for(var d of data) {
	                    if(d[b] === key) {
	                        document.getElementById(id).value = "";
	                        this.fire("result", d);
	                        done = true;
	                        found = true;
	                        break;
	                    }
	                }
	                if(done) break;
	            }
	            if(!found) {
	                this.fire("result", null);
	            }
	        }
	    }
	};

	function oncreate$2() {
	    window.comp = this;
	}
	function onupdate$1({changed, current, previous}) {
	    const self = this;

	    if(changed.data) {
	        // update materialize autocomplete data
	        var options = { data: {}, onAutocomplete: it => self.key({keyCode: 13})  };

	        for(var by of current.by) {
	            for(var d of current.data) {
	                options.data[d[by]] = null;
	            }
	        }

	        var elems = document.querySelectorAll('.autocomplete');
	        var instances = M.Autocomplete.init(elems, options);
	    }
	}
	const file$9 = "ui\\tags\\Search.html";

	function create_main_fragment$9(component, ctx) {
		var div, i, text0, text1, input, text2, label, text3, div_class_value, current;

		function keypress_handler(event) {
			component.key(event);
		}

		return {
			c: function create() {
				div = createElement("div");
				i = createElement("i");
				text0 = createText(ctx.icon);
				text1 = createText("\r\n    ");
				input = createElement("input");
				text2 = createText("\r\n    ");
				label = createElement("label");
				text3 = createText(ctx.label);
				i.className = "material-icons prefix";
				addLoc(i, file$9, 18, 4, 591);
				addListener(input, "keypress", keypress_handler);
				setAttribute(input, "type", "text");
				input.id = ctx.id;
				input.className = "autocomplete";
				addLoc(input, file$9, 19, 4, 640);
				label.htmlFor = ctx.id;
				addLoc(label, file$9, 20, 4, 719);
				setAttribute(div, "sv-data", ctx.data);
				div.className = div_class_value = "input-field " + (ctx.col ? "col" : "") + " " + (ctx.col ? ctx.col : "");
				addLoc(div, file$9, 17, 0, 509);
			},

			m: function mount(target, anchor) {
				insert(target, div, anchor);
				append(div, i);
				append(i, text0);
				append(div, text1);
				append(div, input);
				append(div, text2);
				append(div, label);
				append(label, text3);
				current = true;
			},

			p: function update(changed, ctx) {
				if (changed.icon) {
					setData(text0, ctx.icon);
				}

				if (changed.id) {
					input.id = ctx.id;
				}

				if (changed.label) {
					setData(text3, ctx.label);
				}

				if (changed.id) {
					label.htmlFor = ctx.id;
				}

				if (changed.data) {
					setAttribute(div, "sv-data", ctx.data);
				}

				if ((changed.col) && div_class_value !== (div_class_value = "input-field " + (ctx.col ? "col" : "") + " " + (ctx.col ? ctx.col : ""))) {
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

				removeListener(input, "keypress", keypress_handler);
			}
		};
	}

	function Search(options) {
		this._debugName = '<Search>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data$7(), options.data);
		if (!('data' in this._state)) console.warn("<Search> was created without expected data property 'data'");
		if (!('col' in this._state)) console.warn("<Search> was created without expected data property 'col'");
		if (!('icon' in this._state)) console.warn("<Search> was created without expected data property 'icon'");
		if (!('id' in this._state)) console.warn("<Search> was created without expected data property 'id'");
		if (!('label' in this._state)) console.warn("<Search> was created without expected data property 'label'");
		this._intro = !!options.intro;
		this._handlers.update = [onupdate$1];

		this._fragment = create_main_fragment$9(this, this._state);

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

	assign(Search.prototype, protoDev);
	assign(Search.prototype, methods$3);

	Search.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\tags\Table.html generated by Svelte v2.16.1 */

	function data$8() {
	    return {
	        indexed: false,
	        rows: 10,
	        page: 1,
	        search: null,
	        content: [],
	        actions: []
	    }
	}
	var methods$4 = {
	    call_action(ai, i) {
	        var {content, actions} = this.get();
	        actions[ai].action(content[i], this);
	    },
	    result(res) {
	        if(res) {
	            const { content, rows } = this.get();
	            //going to res' page
	            const page = Math.ceil((content.indexOf(res) + 1) / rows);
	            // console.log(page)
	            this.set({page});
	        }
	        this.fire("result", res);
	    }
	};

	function oncreate$3() {
	    var elems = document.querySelectorAll('.tooltipped');
	    var instances = M.Tooltip.init(elems, {});
	}
	const file$a = "ui\\tags\\Table.html";

	function click_handler$2(event) {
		const { component, ctx } = this._svelte;

		component.call_action(ctx.ai,ctx.i);
	}

	function get_each_context_3(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.action = list[i];
		child_ctx.ai = i;
		return child_ctx;
	}

	function get_each_context_2(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.key = list[i];
		return child_ctx;
	}

	function get_each_context_1(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.row = list[i];
		child_ctx.i = i;
		return child_ctx;
	}

	function get_each_context$2(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.key = list[i];
		return child_ctx;
	}

	function create_main_fragment$a(component, ctx) {
		var text0, table, thead, tr, text1, text2, current_block_type_index, if_block3, table_class_value, text3, if_block4_anchor, current;

		var if_block0 = (ctx.search) && create_if_block_8(component, ctx);

		var if_block1 = (ctx.indexed) && create_if_block_7(component, ctx);

		var if_block2 = (ctx.content && ctx.content.length) && create_if_block_6(component, ctx);

		var if_block_creators = [
			create_if_block_1$3,
			create_else_block_2
		];

		var if_blocks = [];

		function select_block_type(ctx) {
			if (ctx.content && ctx.content.length) return 0;
			return 1;
		}

		current_block_type_index = select_block_type(ctx);
		if_block3 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](component, ctx);

		var if_block4 = (ctx.content.length > ctx.rows) && create_if_block$6(component, ctx);

		return {
			c: function create() {
				if (if_block0) if_block0.c();
				text0 = createText("\r\n");
				table = createElement("table");
				thead = createElement("thead");
				tr = createElement("tr");
				if (if_block1) if_block1.c();
				text1 = createText("\r\n            ");
				if (if_block2) if_block2.c();
				text2 = createText("\r\n    ");
				if_block3.c();
				text3 = createText("\r\n");
				if (if_block4) if_block4.c();
				if_block4_anchor = createComment();
				addLoc(tr, file$a, 37, 8, 1278);
				addLoc(thead, file$a, 36, 4, 1261);
				table.className = table_class_value = ctx.highlight ? "highlight" : "striped";
				addLoc(table, file$a, 35, 0, 1202);
			},

			m: function mount(target, anchor) {
				if (if_block0) if_block0.m(target, anchor);
				insert(target, text0, anchor);
				insert(target, table, anchor);
				append(table, thead);
				append(thead, tr);
				if (if_block1) if_block1.m(tr, null);
				append(tr, text1);
				if (if_block2) if_block2.m(tr, null);
				append(table, text2);
				if_blocks[current_block_type_index].m(table, null);
				insert(target, text3, anchor);
				if (if_block4) if_block4.m(target, anchor);
				insert(target, if_block4_anchor, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				if (ctx.search) {
					if (if_block0) {
						if_block0.p(changed, ctx);
					} else {
						if_block0 = create_if_block_8(component, ctx);
						if (if_block0) if_block0.c();
					}

					if_block0.i(text0.parentNode, text0);
				} else if (if_block0) {
					if_block0.o(function() {
						if_block0.d(1);
						if_block0 = null;
					});
				}

				if (ctx.indexed) {
					if (!if_block1) {
						if_block1 = create_if_block_7(component, ctx);
						if_block1.c();
						if_block1.m(tr, text1);
					}
				} else if (if_block1) {
					if_block1.d(1);
					if_block1 = null;
				}

				if (ctx.content && ctx.content.length) {
					if (if_block2) {
						if_block2.p(changed, ctx);
					} else {
						if_block2 = create_if_block_6(component, ctx);
						if_block2.c();
						if_block2.m(tr, null);
					}
				} else if (if_block2) {
					if_block2.d(1);
					if_block2 = null;
				}

				var previous_block_index = current_block_type_index;
				current_block_type_index = select_block_type(ctx);
				if (current_block_type_index === previous_block_index) {
					if_blocks[current_block_type_index].p(changed, ctx);
				} else {
					if_block3.o(function() {
						if_blocks[previous_block_index].d(1);
						if_blocks[previous_block_index] = null;
					});

					if_block3 = if_blocks[current_block_type_index];
					if (!if_block3) {
						if_block3 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](component, ctx);
						if_block3.c();
					}
					if_block3.m(table, null);
				}

				if ((!current || changed.highlight) && table_class_value !== (table_class_value = ctx.highlight ? "highlight" : "striped")) {
					table.className = table_class_value;
				}

				if (ctx.content.length > ctx.rows) {
					if (if_block4) {
						if_block4.p(changed, ctx);
					} else {
						if_block4 = create_if_block$6(component, ctx);
						if (if_block4) if_block4.c();
					}

					if_block4.i(if_block4_anchor.parentNode, if_block4_anchor);
				} else if (if_block4) {
					if_block4.o(function() {
						if_block4.d(1);
						if_block4 = null;
					});
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 3);

				if (if_block0) if_block0.o(outrocallback);
				else outrocallback();

				if (if_block3) if_block3.o(outrocallback);
				else outrocallback();

				if (if_block4) if_block4.o(outrocallback);
				else outrocallback();

				current = false;
			},

			d: function destroy$$1(detach) {
				if (if_block0) if_block0.d(detach);
				if (detach) {
					detachNode(text0);
					detachNode(table);
				}

				if (if_block1) if_block1.d();
				if (if_block2) if_block2.d();
				if_blocks[current_block_type_index].d();
				if (detach) {
					detachNode(text3);
				}

				if (if_block4) if_block4.d(detach);
				if (detach) {
					detachNode(if_block4_anchor);
				}
			}
		};
	}

	// (33:0) {#if search}
	function create_if_block_8(component, ctx) {
		var current;

		var search_initial_data = { data: ctx.content, by: ctx.search };
		var search = new Search({
			root: component.root,
			store: component.store,
			data: search_initial_data
		});

		search.on("result", function(event) {
			component.result(event);
		});

		return {
			c: function create() {
				search._fragment.c();
			},

			m: function mount(target, anchor) {
				search._mount(target, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				var search_changes = {};
				if (changed.content) search_changes.data = ctx.content;
				if (changed.search) search_changes.by = ctx.search;
				search._set(search_changes);
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				if (search) search._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				search.destroy(detach);
			}
		};
	}

	// (39:12) {#if indexed}
	function create_if_block_7(component, ctx) {
		var th;

		return {
			c: function create() {
				th = createElement("th");
				addLoc(th, file$a, 39, 16, 1327);
			},

			m: function mount(target, anchor) {
				insert(target, th, anchor);
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(th);
				}
			}
		};
	}

	// (42:12) {#if content && content.length}
	function create_if_block_6(component, ctx) {
		var each_anchor;

		var each_value = ctx.Object.keys(ctx.content[0]);

		var each_blocks = [];

		for (var i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block_3(component, get_each_context$2(ctx, each_value, i));
		}

		var each_else = null;

		if (!each_value.length) {
			each_else = create_else_block_3(component, ctx);
			each_else.c();
		}

		return {
			c: function create() {
				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				each_anchor = createComment();
			},

			m: function mount(target, anchor) {
				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(target, anchor);
				}

				insert(target, each_anchor, anchor);

				if (each_else) {
					each_else.m(target, null);
				}
			},

			p: function update(changed, ctx) {
				if (changed.Object || changed.content) {
					each_value = ctx.Object.keys(ctx.content[0]);

					for (var i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context$2(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block_3(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(each_anchor.parentNode, each_anchor);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value.length;
				}

				if (each_value.length) {
					if (each_else) {
						each_else.d(1);
						each_else = null;
					}
				} else if (!each_else) {
					each_else = create_else_block_3(component, ctx);
					each_else.c();
					each_else.m(each_anchor.parentNode, each_anchor);
				}
			},

			d: function destroy$$1(detach) {
				destroyEach(each_blocks, detach);

				if (detach) {
					detachNode(each_anchor);
				}

				if (each_else) each_else.d(detach);
			}
		};
	}

	// (45:16) {:else}
	function create_else_block_3(component, ctx) {
		var th;

		return {
			c: function create() {
				th = createElement("th");
				th.textContent = "Empty table";
				addLoc(th, file$a, 45, 20, 1539);
			},

			m: function mount(target, anchor) {
				insert(target, th, anchor);
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(th);
				}
			}
		};
	}

	// (43:16) {#each Object.keys(content[0]) as key}
	function create_each_block_3(component, ctx) {
		var th, text_value = ctx.key, text;

		return {
			c: function create() {
				th = createElement("th");
				text = createText(text_value);
				addLoc(th, file$a, 43, 20, 1478);
			},

			m: function mount(target, anchor) {
				insert(target, th, anchor);
				append(th, text);
			},

			p: function update(changed, ctx) {
				if ((changed.Object || changed.content) && text_value !== (text_value = ctx.key)) {
					setData(text, text_value);
				}
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(th);
				}
			}
		};
	}

	// (80:4) {:else}
	function create_else_block_2(component, ctx) {
		var tbody, tr, td, current;

		return {
			c: function create() {
				tbody = createElement("tbody");
				tr = createElement("tr");
				td = createElement("td");
				td.textContent = "Empty list";
				addLoc(td, file$a, 80, 19, 3005);
				addLoc(tr, file$a, 80, 15, 3001);
				addLoc(tbody, file$a, 80, 8, 2994);
			},

			m: function mount(target, anchor) {
				insert(target, tbody, anchor);
				append(tbody, tr);
				append(tr, td);
				current = true;
			},

			p: noop,

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(tbody);
				}
			}
		};
	}

	// (51:4) {#if content && content.length}
	function create_if_block_1$3(component, ctx) {
		var tbody, current;

		var each_value_1 = ctx.content;

		var each_blocks = [];

		for (var i = 0; i < each_value_1.length; i += 1) {
			each_blocks[i] = create_each_block$2(component, get_each_context_1(ctx, each_value_1, i));
		}

		function outroBlock(i, detach, fn) {
			if (each_blocks[i]) {
				each_blocks[i].o(() => {
					if (detach) {
						each_blocks[i].d(detach);
						each_blocks[i] = null;
					}
					if (fn) fn();
				});
			}
		}

		return {
			c: function create() {
				tbody = createElement("tbody");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}
				addLoc(tbody, file$a, 51, 4, 1675);
			},

			m: function mount(target, anchor) {
				insert(target, tbody, anchor);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].i(tbody, null);
				}

				current = true;
			},

			p: function update(changed, ctx) {
				if (changed.page || changed.Math || changed.rows || changed.Object || changed.content || changed.actions || changed.indexed) {
					each_value_1 = ctx.content;

					for (var i = 0; i < each_value_1.length; i += 1) {
						const child_ctx = get_each_context_1(ctx, each_value_1, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block$2(component, child_ctx);
							each_blocks[i].c();
						}
						each_blocks[i].i(tbody, null);
					}
					for (; i < each_blocks.length; i += 1) outroBlock(i, 1);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				each_blocks = each_blocks.filter(Boolean);
				const countdown = callAfter(outrocallback, each_blocks.length);
				for (let i = 0; i < each_blocks.length; i += 1) outroBlock(i, 0, countdown);

				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(tbody);
				}

				destroyEach(each_blocks, detach);
			}
		};
	}

	// (54:12) {#if page === Math.ceil((i + 1) / rows)}
	function create_if_block_2(component, ctx) {
		var tr, text, current;

		var if_block = (ctx.indexed) && create_if_block_5(component, ctx);

		var each_value_2 = ctx.Object.keys(ctx.row);

		var each_blocks = [];

		for (var i = 0; i < each_value_2.length; i += 1) {
			each_blocks[i] = create_each_block_1(component, get_each_context_2(ctx, each_value_2, i));
		}

		function outroBlock(i, detach, fn) {
			if (each_blocks[i]) {
				each_blocks[i].o(() => {
					if (detach) {
						each_blocks[i].d(detach);
						each_blocks[i] = null;
					}
					if (fn) fn();
				});
			}
		}

		return {
			c: function create() {
				tr = createElement("tr");
				if (if_block) if_block.c();
				text = createText("\r\n                    ");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}
				addLoc(tr, file$a, 54, 16, 1789);
			},

			m: function mount(target, anchor) {
				insert(target, tr, anchor);
				if (if_block) if_block.m(tr, null);
				append(tr, text);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].i(tr, null);
				}

				current = true;
			},

			p: function update(changed, ctx) {
				if (ctx.indexed) {
					if (!if_block) {
						if_block = create_if_block_5(component, ctx);
						if_block.c();
						if_block.m(tr, text);
					}
				} else if (if_block) {
					if_block.d(1);
					if_block = null;
				}

				if (changed.content || changed.Object || changed.actions) {
					each_value_2 = ctx.Object.keys(ctx.row);

					for (var i = 0; i < each_value_2.length; i += 1) {
						const child_ctx = get_each_context_2(ctx, each_value_2, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block_1(component, child_ctx);
							each_blocks[i].c();
						}
						each_blocks[i].i(tr, null);
					}
					for (; i < each_blocks.length; i += 1) outroBlock(i, 1);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				each_blocks = each_blocks.filter(Boolean);
				const countdown = callAfter(outrocallback, each_blocks.length);
				for (let i = 0; i < each_blocks.length; i += 1) outroBlock(i, 0, countdown);

				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(tr);
				}

				if (if_block) if_block.d();

				destroyEach(each_blocks, detach);
			}
		};
	}

	// (56:20) {#if indexed}
	function create_if_block_5(component, ctx) {
		var td, text_value = ctx.i+1, text;

		return {
			c: function create() {
				td = createElement("td");
				text = createText(text_value);
				addLoc(td, file$a, 56, 24, 1854);
			},

			m: function mount(target, anchor) {
				insert(target, td, anchor);
				append(td, text);
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(td);
				}
			}
		};
	}

	// (71:28) {:else}
	function create_else_block_1(component, ctx) {
		var td, text_value = ctx.row[ctx.key].length > 10 ? ctx.row[ctx.key].slice(0, 10)+"..." : ctx.row[ctx.key], text, current;

		return {
			c: function create() {
				td = createElement("td");
				text = createText(text_value);
				addLoc(td, file$a, 71, 32, 2731);
			},

			m: function mount(target, anchor) {
				insert(target, td, anchor);
				append(td, text);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.content || changed.Object) && text_value !== (text_value = ctx.row[ctx.key].length > 10 ? ctx.row[ctx.key].slice(0, 10)+"..." : ctx.row[ctx.key])) {
					setData(text, text_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(td);
				}
			}
		};
	}

	// (61:28) {#if typeof(row[key]) === 'object'}
	function create_if_block_3(component, ctx) {
		var td, current;

		var each_value_3 = ctx.actions;

		var each_blocks = [];

		for (var i = 0; i < each_value_3.length; i += 1) {
			each_blocks[i] = create_each_block_2(component, get_each_context_3(ctx, each_value_3, i));
		}

		function outroBlock(i, detach, fn) {
			if (each_blocks[i]) {
				each_blocks[i].o(() => {
					if (detach) {
						each_blocks[i].d(detach);
						each_blocks[i] = null;
					}
					if (fn) fn();
				});
			}
		}

		return {
			c: function create() {
				td = createElement("td");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}
				addLoc(td, file$a, 61, 32, 2077);
			},

			m: function mount(target, anchor) {
				insert(target, td, anchor);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].i(td, null);
				}

				current = true;
			},

			p: function update(changed, ctx) {
				if (changed.content || changed.Object || changed.actions) {
					each_value_3 = ctx.actions;

					for (var i = 0; i < each_value_3.length; i += 1) {
						const child_ctx = get_each_context_3(ctx, each_value_3, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block_2(component, child_ctx);
							each_blocks[i].c();
						}
						each_blocks[i].i(td, null);
					}
					for (; i < each_blocks.length; i += 1) outroBlock(i, 1);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				each_blocks = each_blocks.filter(Boolean);
				const countdown = callAfter(outrocallback, each_blocks.length);
				for (let i = 0; i < each_blocks.length; i += 1) outroBlock(i, 0, countdown);

				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(td);
				}

				destroyEach(each_blocks, detach);
			}
		};
	}

	// (66:40) {:else}
	function create_else_block$3(component, ctx) {
		var span, text_value = ctx.action.icon, text, current;

		var i = new Icon({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() }
		});

		return {
			c: function create() {
				span = createElement("span");
				text = createText(text_value);
				i._fragment.c();
				addLoc(span, file$a, 66, 44, 2496);
			},

			m: function mount(target, anchor) {
				insert(target, span, anchor);
				append(i._slotted.default, text);
				i._mount(span, null);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((!current || changed.actions) && text_value !== (text_value = ctx.action.icon)) {
					setData(text, text_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				if (i) i._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(span);
				}

				i.destroy();
			}
		};
	}

	// (64:40) {#if row[key][ai] === true}
	function create_if_block_4(component, ctx) {
		var a, text_value = ctx.action.icon, text, a_data_tooltip_value, current;

		var i = new Icon({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() }
		});

		return {
			c: function create() {
				a = createElement("a");
				text = createText(text_value);
				i._fragment.c();
				a._svelte = { component, ctx };

				addListener(a, "click", click_handler$2);
				a.className = "waves-effect tooltipped";
				a.dataset.position = "top";
				a.dataset.tooltip = a_data_tooltip_value = ctx.action.tooltip;
				addLoc(a, file$a, 64, 44, 2263);
			},

			m: function mount(target, anchor) {
				insert(target, a, anchor);
				append(i._slotted.default, text);
				i._mount(a, null);
				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				if ((!current || changed.actions) && text_value !== (text_value = ctx.action.icon)) {
					setData(text, text_value);
				}

				a._svelte.ctx = ctx;
				if ((!current || changed.actions) && a_data_tooltip_value !== (a_data_tooltip_value = ctx.action.tooltip)) {
					a.dataset.tooltip = a_data_tooltip_value;
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				if (i) i._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(a);
				}

				i.destroy();
				removeListener(a, "click", click_handler$2);
			}
		};
	}

	// (63:36) {#each actions as action, ai}
	function create_each_block_2(component, ctx) {
		var current_block_type_index, if_block, if_block_anchor, current;

		var if_block_creators = [
			create_if_block_4,
			create_else_block$3
		];

		var if_blocks = [];

		function select_block_type_2(ctx) {
			if (ctx.row[ctx.key][ctx.ai] === true) return 0;
			return 1;
		}

		current_block_type_index = select_block_type_2(ctx);
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
				current_block_type_index = select_block_type_2(ctx);
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

	// (59:20) {#each Object.keys(row) as key}
	function create_each_block_1(component, ctx) {
		var td, current_block_type_index, if_block, current;

		var if_block_creators = [
			create_if_block_3,
			create_else_block_1
		];

		var if_blocks = [];

		function select_block_type_1(ctx) {
			if (typeof(ctx.row[ctx.key]) === 'object') return 0;
			return 1;
		}

		current_block_type_index = select_block_type_1(ctx);
		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](component, ctx);

		return {
			c: function create() {
				td = createElement("td");
				if_block.c();
				addLoc(td, file$a, 59, 24, 1974);
			},

			m: function mount(target, anchor) {
				insert(target, td, anchor);
				if_blocks[current_block_type_index].m(td, null);
				current = true;
			},

			p: function update(changed, ctx) {
				var previous_block_index = current_block_type_index;
				current_block_type_index = select_block_type_1(ctx);
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
					if_block.m(td, null);
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
					detachNode(td);
				}

				if_blocks[current_block_type_index].d();
			}
		};
	}

	// (53:8) {#each content as row, i}
	function create_each_block$2(component, ctx) {
		var if_block_anchor, current;

		var if_block = (ctx.page === ctx.Math.ceil((ctx.i + 1) / ctx.rows)) && create_if_block_2(component, ctx);

		return {
			c: function create() {
				if (if_block) if_block.c();
				if_block_anchor = createComment();
			},

			m: function mount(target, anchor) {
				if (if_block) if_block.m(target, anchor);
				insert(target, if_block_anchor, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				if (ctx.page === ctx.Math.ceil((ctx.i + 1) / ctx.rows)) {
					if (if_block) {
						if_block.p(changed, ctx);
					} else {
						if_block = create_if_block_2(component, ctx);
						if (if_block) if_block.c();
					}

					if_block.i(if_block_anchor.parentNode, if_block_anchor);
				} else if (if_block) {
					if_block.o(function() {
						if_block.d(1);
						if_block = null;
					});
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
				if (if_block) if_block.d(detach);
				if (detach) {
					detachNode(if_block_anchor);
				}
			}
		};
	}

	// (84:0) {#if content.length > rows}
	function create_if_block$6(component, ctx) {
		var pagination_updating = {}, current;

		var pagination_initial_data = { pages: ctx.Math.ceil(ctx.content.length / ctx.rows) };
		if (ctx.page  !== void 0) {
			pagination_initial_data.page = ctx.page ;
			pagination_updating.page = true;
		}
		var pagination = new Pagination({
			root: component.root,
			store: component.store,
			data: pagination_initial_data,
			_bind(changed, childState) {
				var newState = {};
				if (!pagination_updating.page && changed.page) {
					newState.page = childState.page;
				}
				component._set(newState);
				pagination_updating = {};
			}
		});

		component.root._beforecreate.push(() => {
			pagination._bind({ page: 1 }, pagination.get());
		});

		return {
			c: function create() {
				pagination._fragment.c();
			},

			m: function mount(target, anchor) {
				pagination._mount(target, anchor);
				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				var pagination_changes = {};
				if (changed.Math || changed.content || changed.rows) pagination_changes.pages = ctx.Math.ceil(ctx.content.length / ctx.rows);
				if (!pagination_updating.page && changed.page) {
					pagination_changes.page = ctx.page ;
					pagination_updating.page = ctx.page  !== void 0;
				}
				pagination._set(pagination_changes);
				pagination_updating = {};
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				if (pagination) pagination._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				pagination.destroy(detach);
			}
		};
	}

	function Table(options) {
		this._debugName = '<Table>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(assign({ Object : Object, Math : Math }, data$8()), options.data);
		if (!('search' in this._state)) console.warn("<Table> was created without expected data property 'search'");
		if (!('content' in this._state)) console.warn("<Table> was created without expected data property 'content'");
		if (!('highlight' in this._state)) console.warn("<Table> was created without expected data property 'highlight'");
		if (!('indexed' in this._state)) console.warn("<Table> was created without expected data property 'indexed'");

		if (!('page' in this._state)) console.warn("<Table> was created without expected data property 'page'");

		if (!('rows' in this._state)) console.warn("<Table> was created without expected data property 'rows'");
		if (!('actions' in this._state)) console.warn("<Table> was created without expected data property 'actions'");
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$a(this, this._state);

		this.root._oncreate.push(() => {
			oncreate$3.call(this);
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

	assign(Table.prototype, protoDev);
	assign(Table.prototype, methods$4);

	Table.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\tags\RequestBtn.html generated by Svelte v2.16.1 */

	function data$9() {
	    return {
	        disabled: false,
	        body: {}, // you can fill this
	        bodyById: null, // list of DOM input element IDs to make body from their values
	        get: null,
	        post: null,
	        response: null, // bind:response if you need the response
	    }
	}
	var methods$5 = {
	    send(e) {
	        this.fire("click",e);
	        const self = this;
	        e.preventDefault();
	        self.set({disabled: true});
	        var {get: get$$1, post, body, bodyById} = self.get();
	        if(bodyById) {
	            for(var i of bodyById) {
	                body[i] = document.getElementById(i).value;
	            }
	        }
	        if(post) {
	            return fetch(post, {
	                method: "POST",
	                mode: "same-origin",
	                credentials: "same-origin",
	                headers: {
	                    "Content-Type": "application/json"
	                },
	                redirect: "follow",
	                body: JSON.stringify(body)
	            })
	            .then(response => {
	                if(response.redirected) {
	                    window.location.href = response.url;
	                }
	                return response;
	            })
	            .then(response => {
	                var contentType = response.headers.get("content-type");
	                if(contentType && contentType.includes("application/json")) {
	                    return response.json().then(json => ({status: response.status, body: json.body}));
	                }
	                return {status: response.status, body: null};
	            })
	            .then(response => {
	                self.set({ response, disabled: false });
	                self.fire("response", {err: null, response});
	            })
	            .catch(err => {
	                self.set({ response: null, disabled: false });
	                self.fire("response", {err, response: null});
	            });
	        } else if(get$$1) {
	            // make urlencoded
	            if(body) {
	                get$$1 += "?";
	                for(var i in body) {
	                    get$$1 += `${i}=${body[i]}&`;
	                }
	            }
	            return fetch(get$$1, {
	                method: "GET",
	                mode: "same-origin",
	                credentials: "same-origin",
	                headers: {
	                    "Content-Type": "application/x-www-form-urlencoded"
	                },
	                redirect: "follow",
	            })
	            .then(response => {
	                if(response.redirected) {
	                    window.location.href = response.url;
	                }
	                return response
	            })
	            .then(response => {
	                var contentType = response.headers.get("content-type");
	                if(contentType && contentType.includes("application/json")) {
	                    return response.json().then(json => ({status: response.status, body: json.body}));
	                }
	                return {status: response.status, body: null};
	            })
	            .then(response => {
	                self.set({ response, disabled: false });
	                self.fire("response", {err: null, response});
	            })
	            .catch(err => {
	                self.set({ response: null, disabled: false });
	                self.fire("response", {err, response: null});
	            });
	        }
	    }
	};

	const file$b = "ui\\tags\\RequestBtn.html";

	function create_main_fragment$b(component, ctx) {
		var button, slot_content_default = component._slotted.default, button_class_value, current;

		function click_handler(event) {
			component.send(event);
		}

		return {
			c: function create() {
				button = createElement("button");
				addListener(button, "click", click_handler);
				button.className = button_class_value = "btn waves-effect waves-light yellow black-text " + (ctx.disabled ? "disabled" : "");
				addLoc(button, file$b, 13, 0, 433);
			},

			m: function mount(target, anchor) {
				insert(target, button, anchor);

				if (slot_content_default) {
					append(button, slot_content_default);
				}

				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.disabled) && button_class_value !== (button_class_value = "btn waves-effect waves-light yellow black-text " + (ctx.disabled ? "disabled" : ""))) {
					button.className = button_class_value;
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(button);
				}

				if (slot_content_default) {
					reinsertChildren(button, slot_content_default);
				}

				removeListener(button, "click", click_handler);
			}
		};
	}

	function RequestBtn(options) {
		this._debugName = '<RequestBtn>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data$9(), options.data);
		if (!('disabled' in this._state)) console.warn("<RequestBtn> was created without expected data property 'disabled'");
		this._intro = !!options.intro;

		this._slotted = options.slots || {};

		this._fragment = create_main_fragment$b(this, this._state);

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);
		}

		this._intro = true;
	}

	assign(RequestBtn.prototype, protoDev);
	assign(RequestBtn.prototype, methods$5);

	RequestBtn.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\panel\admin_pages\AccessControlCenter.html generated by Svelte v2.16.1 */

	function data$a() {
	    return {
	        location,
	        utils: window.utils,confirmModal() {
	            return M.Modal.getInstance(document.getElementById('confirm'));
	        },
	        getusers: utils.fetch("/user/all")
	            .then(response => {
	                var users = response.body;
	                var rows = [];
	                for(var user of users) {
	                    if(cdsuser.access >= user.access) {
	                        //[delete, ban, user, mod, admin]
	                        user.actions = [
	                            true, // delete
	                            user.access!=0, // ban
	                            user.access!=2, // user
	                            user.access!=3, // mod
	                            user.access!=5, // admin
	                        ];
	                        delete user.access;
	                        rows.push(user);
	                    }
	                }
	                return rows;
	            })
	            .catch(err => utils.toast("something went wrong !")),
	    };
	}
	var methods$6 = {
	    added(res) {
	        if(res.err) {
	            utils.toast("something went wrong !");
	        } else {
	            utils.toast("Done");
	            utils.reload();
	        }
	    }
	};

	const file$c = "ui\\panel\\admin_pages\\AccessControlCenter.html";

	function create_main_fragment$c(component, ctx) {
		var div0, h40, text1, p, text3, h41, text5, await_block_anchor, promise, text6, div1, h42, text8, text9, text10, text11, text12, text13, current;

		var modal_initial_data = {
		 	id: "confirm",
		 	nobtn: true,
		 	buttons: [
	        function Delete(modal) {
	            ctx.utils.fetch("/user/remove", {id: ctx.confirmModal().user.id})
	            .then(r=>{
	                if(r.status == 200) {
	                    ctx.utils.toast("Done");
	                    ctx.utils.reload();
	                }
	                else ctx.utils.toast("something went wrong !");
	            })
	            .catch(err => ctx.utils.toast("something went wrong !"));
	        },
	        function No(modal) {
	            modal.close();
	        }]
		 };
		var modal = new Modal({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: modal_initial_data
		});

		let info = {
			component,
			ctx,
			current: null,
			pending: create_pending_block,
			then: create_then_block,
			catch: create_catch_block,
			value: 'users',
			error: 'error',
			blocks: Array(3)
		};

		handlePromise(promise = ctx.getusers, info);

		var card0_initial_data = {
		 	image: "/public/img/privacy.png",
		 	col: "s12 m10 offset-m1 l10 offset-l1"
		 };
		var card0 = new Card({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: card0_initial_data
		});

		var input0_initial_data = {
		 	col: "s12",
		 	label: "Email",
		 	id: "email",
		 	type: "email"
		 };
		var input0 = new Input({
			root: component.root,
			store: component.store,
			data: input0_initial_data
		});

		var input1_initial_data = {
		 	col: "s12",
		 	label: "First name",
		 	id: "firstname",
		 	type: "text"
		 };
		var input1 = new Input({
			root: component.root,
			store: component.store,
			data: input1_initial_data
		});

		var input2_initial_data = {
		 	col: "s12",
		 	label: "Last name",
		 	id: "lastname",
		 	type: "text"
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

		var requestbtn_initial_data = {
		 	post: "/user/add",
		 	bodyById: [ 'email' , 'password', "firstname", "lastname" ]
		 };
		var requestbtn = new RequestBtn({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: requestbtn_initial_data
		});

		requestbtn.on("response", function(event) {
			component.added(event);
		});

		var form_initial_data = { response: {} };
		var form = new Form({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: form_initial_data
		});

		var card1_initial_data = { col: "s12 m10 offset-m1 l10 offset-l1" };
		var card1 = new Card({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: card1_initial_data
		});

		return {
			c: function create() {
				div0 = createElement("div");
				h40 = createElement("h4");
				h40.textContent = "Confirm Delete";
				text1 = createText("\r\n        ");
				p = createElement("p");
				p.textContent = "Do you really want to delete the user ?";
				modal._fragment.c();
				text3 = createText("\r\n\t");
				h41 = createElement("h4");
				h41.textContent = "Users";
				text5 = createText("\r\n        ");
				await_block_anchor = createComment();

				info.block.c();

				card0._fragment.c();
				text6 = createText("\r\n");
				div1 = createElement("div");
				h42 = createElement("h4");
				h42.textContent = "Add a User";
				text8 = createText("\r\n\t\t");
				input0._fragment.c();
				text9 = createText("\r\n            ");
				input1._fragment.c();
				text10 = createText("\r\n            ");
				input2._fragment.c();
				text11 = createText("\r\n            ");
				input3._fragment.c();
				text12 = createText("\r\n            ");
				text13 = createText("Add");
				requestbtn._fragment.c();
				form._fragment.c();
				card1._fragment.c();
				addLoc(h40, file$c, 17, 8, 568);
				addLoc(p, file$c, 18, 8, 601);
				addLoc(h41, file$c, 22, 2, 866);
				div0.className = "row";
				addLoc(div0, file$c, 0, 0, 0);
				addLoc(h42, file$c, 80, 2, 3380);
				div1.className = "row";
				addLoc(div1, file$c, 78, 0, 3312);
			},

			m: function mount(target, anchor) {
				insert(target, div0, anchor);
				append(modal._slotted.default, h40);
				append(modal._slotted.default, text1);
				append(modal._slotted.default, p);
				modal._mount(div0, null);
				append(div0, text3);
				append(card0._slotted.default, h41);
				append(card0._slotted.default, text5);
				append(card0._slotted.default, await_block_anchor);

				info.block.i(card0._slotted.default, info.anchor = null);
				info.mount = () => await_block_anchor.parentNode;
				info.anchor = await_block_anchor;

				card0._mount(div0, null);
				insert(target, text6, anchor);
				insert(target, div1, anchor);
				append(card1._slotted.default, h42);
				append(card1._slotted.default, text8);
				input0._mount(form._slotted.default, null);
				append(form._slotted.default, text9);
				input1._mount(form._slotted.default, null);
				append(form._slotted.default, text10);
				input2._mount(form._slotted.default, null);
				append(form._slotted.default, text11);
				input3._mount(form._slotted.default, null);
				append(form._slotted.default, text12);
				append(requestbtn._slotted.default, text13);
				requestbtn._mount(form._slotted.default, null);
				form._mount(card1._slotted.default, null);
				card1._mount(div1, null);
				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				var modal_changes = {};
				if (changed.utils || changed.confirmModal) modal_changes.buttons = [
	        function Delete(modal) {
	            ctx.utils.fetch("/user/remove", {id: ctx.confirmModal().user.id})
	            .then(r=>{
	                if(r.status == 200) {
	                    ctx.utils.toast("Done");
	                    ctx.utils.reload();
	                }
	                else ctx.utils.toast("something went wrong !");
	            })
	            .catch(err => ctx.utils.toast("something went wrong !"));
	        },
	        function No(modal) {
	            modal.close();
	        }];
				modal._set(modal_changes);

				info.ctx = ctx;

				if (('getusers' in changed) && promise !== (promise = ctx.getusers) && handlePromise(promise, info)) ; else {
					info.block.p(changed, assign(assign({}, ctx), info.resolved));
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 10);

				if (modal) modal._fragment.o(outrocallback);

				const countdown = callAfter(outrocallback, 3);
				for (let i = 0; i < 3; i += 1) {
					const block = info.blocks[i];
					if (block) block.o(countdown);
					else countdown();
				}

				if (card0) card0._fragment.o(outrocallback);
				if (input0) input0._fragment.o(outrocallback);
				if (input1) input1._fragment.o(outrocallback);
				if (input2) input2._fragment.o(outrocallback);
				if (input3) input3._fragment.o(outrocallback);
				if (requestbtn) requestbtn._fragment.o(outrocallback);
				if (form) form._fragment.o(outrocallback);
				if (card1) card1._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div0);
				}

				modal.destroy();

				info.block.d();
				info = null;

				card0.destroy();
				if (detach) {
					detachNode(text6);
					detachNode(div1);
				}

				input0.destroy();
				input1.destroy();
				input2.destroy();
				input3.destroy();
				requestbtn.destroy();
				form.destroy();
				card1.destroy();
			}
		};
	}

	// (74:8) {:catch error}
	function create_catch_block(component, ctx) {
		var p, text0, text1_value = ctx.error, text1, current;

		return {
			c: function create() {
				p = createElement("p");
				text0 = createText("error ");
				text1 = createText(text1_value);
				addLoc(p, file$c, 74, 12, 3254);
			},

			m: function mount(target, anchor) {
				insert(target, p, anchor);
				append(p, text0);
				append(p, text1);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.getusers) && text1_value !== (text1_value = ctx.error)) {
					setData(text1, text1_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(p);
				}
			}
		};
	}

	// (26:8) {:then users}
	function create_then_block(component, ctx) {
		var current;

		var table_initial_data = {
		 	highlight: true,
		 	rows: 5,
		 	actions: [{icon: "delete", tooltip: "delete", action(obj, table) {
	                const modal = ctx.confirmModal();
	                modal.user = obj;
	                modal.open();
	            }},{icon: "remove_circle", tooltip: "ban", action(obj, table) {
	                ctx.utils.fetch("/user/access", {id: obj.id, access: 0})
	                .then(r=>{
	                    if(r.status == 200) {
	                        ctx.utils.toast("Done");
	                        ctx.utils.reload();
	                    }
	                    else ctx.utils.toast("something went wrong !");
	                })
	                .catch(err => ctx.utils.toast("something went wrong !"));
	                
	            }},{icon: "remove_red_eye", tooltip: "user", action(obj, table) {
	                ctx.utils.fetch("/user/access", {id: obj.id, access: 2})
	                .then(r=>{
	                    if(r.status == 200) {
	                        ctx.utils.toast("Done");
	                        ctx.utils.reload();
	                    }
	                    else ctx.utils.toast("something went wrong !");
	                })
	                .catch(err => ctx.utils.toast("something went wrong !"));
	            }},{icon: "edit", tooltip: "mod", action(obj, table) {
	                ctx.utils.fetch("/user/access", {id: obj.id, access: 3})
	                .then(r=>{
	                    if(r.status == 200) {
	                        ctx.utils.toast("Done");
	                        ctx.utils.reload();
	                    }
	                    else ctx.utils.toast("something went wrong !");
	                })
	                .catch(err => ctx.utils.toast("something went wrong !"));
	            }},{icon: "verified_user", tooltip: "admin", action(obj, table) {
	                ctx.utils.fetch("/user/access", {id: obj.id, access: 5})
	                .then(r=>{
	                    if(r.status == 200) {
	                        ctx.utils.toast("Done");
	                        ctx.utils.reload();
	                    }
	                    else ctx.utils.toast("something went wrong !");
	                })
	                .catch(err => ctx.utils.toast("something went wrong !"));
	            }},],
		 	content: ctx.users,
		 	search: ["id", "email", "firstname", "lastname"]
		 };
		var table = new Table({
			root: component.root,
			store: component.store,
			data: table_initial_data
		});

		return {
			c: function create() {
				table._fragment.c();
			},

			m: function mount(target, anchor) {
				table._mount(target, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				var table_changes = {};
				if (changed.confirmModal || changed.utils) table_changes.actions = [{icon: "delete", tooltip: "delete", action(obj, table) {
	                const modal = ctx.confirmModal();
	                modal.user = obj;
	                modal.open();
	            }},{icon: "remove_circle", tooltip: "ban", action(obj, table) {
	                ctx.utils.fetch("/user/access", {id: obj.id, access: 0})
	                .then(r=>{
	                    if(r.status == 200) {
	                        ctx.utils.toast("Done");
	                        ctx.utils.reload();
	                    }
	                    else ctx.utils.toast("something went wrong !");
	                })
	                .catch(err => ctx.utils.toast("something went wrong !"));
	                
	            }},{icon: "remove_red_eye", tooltip: "user", action(obj, table) {
	                ctx.utils.fetch("/user/access", {id: obj.id, access: 2})
	                .then(r=>{
	                    if(r.status == 200) {
	                        ctx.utils.toast("Done");
	                        ctx.utils.reload();
	                    }
	                    else ctx.utils.toast("something went wrong !");
	                })
	                .catch(err => ctx.utils.toast("something went wrong !"));
	            }},{icon: "edit", tooltip: "mod", action(obj, table) {
	                ctx.utils.fetch("/user/access", {id: obj.id, access: 3})
	                .then(r=>{
	                    if(r.status == 200) {
	                        ctx.utils.toast("Done");
	                        ctx.utils.reload();
	                    }
	                    else ctx.utils.toast("something went wrong !");
	                })
	                .catch(err => ctx.utils.toast("something went wrong !"));
	            }},{icon: "verified_user", tooltip: "admin", action(obj, table) {
	                ctx.utils.fetch("/user/access", {id: obj.id, access: 5})
	                .then(r=>{
	                    if(r.status == 200) {
	                        ctx.utils.toast("Done");
	                        ctx.utils.reload();
	                    }
	                    else ctx.utils.toast("something went wrong !");
	                })
	                .catch(err => ctx.utils.toast("something went wrong !"));
	            }},];
				if (changed.getusers) table_changes.content = ctx.users;
				table._set(table_changes);
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				if (table) table._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				table.destroy(detach);
			}
		};
	}

	// (24:25)               <Loading/>          {:then users}
	function create_pending_block(component, ctx) {
		var current;

		var loading = new Loading({
			root: component.root,
			store: component.store
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

	function AccessControlCenter(options) {
		this._debugName = '<AccessControlCenter>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data$a(), options.data);
		if (!('utils' in this._state)) console.warn("<AccessControlCenter> was created without expected data property 'utils'");
		if (!('confirmModal' in this._state)) console.warn("<AccessControlCenter> was created without expected data property 'confirmModal'");
		if (!('getusers' in this._state)) console.warn("<AccessControlCenter> was created without expected data property 'getusers'");
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$c(this, this._state);

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}

		this._intro = true;
	}

	assign(AccessControlCenter.prototype, protoDev);
	assign(AccessControlCenter.prototype, methods$6);

	AccessControlCenter.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\tags\Select.html generated by Svelte v2.16.1 */

	function data$b() {
	    return {
	        id: "select",
	        options: [],
	        label: "select",
	        text: "select",
	    }
	}
	var methods$7 = {
	    select() {
	        const { id, options } = this.get();
	        var s = document.getElementById(id);
	        this.fire("select", options[s.value]);
	    }
	};

	function oncreate$4() {
	    var elems = document.querySelectorAll('select');
	    var instances = M.FormSelect.init(elems, {});
	}
	const file$d = "ui\\tags\\Select.html";

	function get_each_context$3(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.option = list[i];
		child_ctx.idx = i;
		return child_ctx;
	}

	function create_main_fragment$d(component, ctx) {
		var div, select, option, text0, text1, label, text2, current;

		var each_value = ctx.options;

		var each_blocks = [];

		for (var i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block$3(component, get_each_context$3(ctx, each_value, i));
		}

		function change_handler(event) {
			component.select();
		}

		return {
			c: function create() {
				div = createElement("div");
				select = createElement("select");
				option = createElement("option");
				text0 = createText(ctx.text);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				text1 = createText("\r\n    ");
				label = createElement("label");
				text2 = createText(ctx.label);
				option.__value = "";
				option.value = option.__value;
				option.disabled = true;
				option.selected = true;
				addLoc(option, file$d, 2, 8, 56);
				addListener(select, "change", change_handler);
				select.id = ctx.id;
				addLoc(select, file$d, 1, 4, 11);
				addLoc(label, file$d, 7, 4, 242);
				addLoc(div, file$d, 0, 0, 0);
			},

			m: function mount(target, anchor) {
				insert(target, div, anchor);
				append(div, select);
				append(select, option);
				append(option, text0);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(select, null);
				}

				append(div, text1);
				append(div, label);
				append(label, text2);
				current = true;
			},

			p: function update(changed, ctx) {
				if (changed.text) {
					setData(text0, ctx.text);
				}

				if (changed.options) {
					each_value = ctx.options;

					for (var i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context$3(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block$3(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(select, null);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value.length;
				}

				if (changed.id) {
					select.id = ctx.id;
				}

				if (changed.label) {
					setData(text2, ctx.label);
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

				destroyEach(each_blocks, detach);

				removeListener(select, "change", change_handler);
			}
		};
	}

	// (4:8) {#each options as option, idx}
	function create_each_block$3(component, ctx) {
		var option, text_value = ctx.option.name, text;

		return {
			c: function create() {
				option = createElement("option");
				text = createText(text_value);
				option.__value = ctx.idx;
				option.value = option.__value;
				addLoc(option, file$d, 4, 12, 160);
			},

			m: function mount(target, anchor) {
				insert(target, option, anchor);
				append(option, text);
			},

			p: function update(changed, ctx) {
				if ((changed.options) && text_value !== (text_value = ctx.option.name)) {
					setData(text, text_value);
				}
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(option);
				}
			}
		};
	}

	function Select(options) {
		this._debugName = '<Select>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data$b(), options.data);
		if (!('id' in this._state)) console.warn("<Select> was created without expected data property 'id'");
		if (!('text' in this._state)) console.warn("<Select> was created without expected data property 'text'");
		if (!('options' in this._state)) console.warn("<Select> was created without expected data property 'options'");
		if (!('label' in this._state)) console.warn("<Select> was created without expected data property 'label'");
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$d(this, this._state);

		this.root._oncreate.push(() => {
			oncreate$4.call(this);
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

	assign(Select.prototype, protoDev);
	assign(Select.prototype, methods$7);

	Select.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\panel\admin_pages\Forms.html generated by Svelte v2.16.1 */

	function data$c(){
	    var mob = {data: null};
	    return {
	        objModal: null,
	        crudindex: 0,
	        datum_id: null,
	        form_id: null,
	        mob,
	        getforms: utils.fetch("/form/all")
	        .then(response => {
	            var mobs = response.body;
	                mob.data = mobs;
	                var rows = [];
	                for(var mb of mobs) {
	                        var datum = {
	                            id : mb.id,
	                            name: mb.name,
	                            iframe: mb.iframe,
	                            status: mb.status
	                        };
	                        // [ DELETE , EDIT , BLOCK , UNBLOCK ]
	                        datum.actions = [
	                            [5, 7].includes(cdsuser.access), 
	                            [3, 5, 7].includes(cdsuser.access), // dev , admin and mod can edit the apply
	                            [5, 7].includes(cdsuser.access) && datum.status == 1,
	                            [5, 7].includes(cdsuser.access) && datum.status == 0,
	                        ];
	                        
	                        rows.push(datum);
	                }
	                return rows
	            })
	            .catch(err => utils.toast("something went wrong !")),
	    }
	}
	var methods$8 = {
	    fireMe(index){
	        if(index === 0){
	            this.set({crudindex: index});
	            var elems = document.querySelector('.modal');
	            var instances = M.Modal.init(elems, {});
	            instances.open();    
	        }
	    },
	    loadForm(form) {
	        this.set({form_id: form.id});
	    },
	    open({obj, index}){
	        const mob = this.get().mob.data;
	            for(var mb of mob){
	                if(obj.id === mb.id) this.set({crudindex: index, objModal: mb, datum_id: obj.id});
	            }
	            var elems = document.querySelector('.modal');
	            var instances = M.Modal.init(elems, {});
	            instances.open();
	    },
	    action(){
	        
	        const {crudindex} = this.get();
	        const {datum_id} = this.get();

	        // get down the road with crudindex!!!
	        if(crudindex === 1){
	            const elname = document.getElementById("name");
	            const eliframe = document.getElementById("iframe");

	            const name = elname.value ? elname.value : null;
	            const iframe = eliframe.value ? eliframe.value : null;
	            
	            utils.fetch("/form/edit", {name, iframe, datum_id}).then((res)=>{
	                if(res.status!=200){
	                    utils.toast("something went wrong !");
	                } else{
	                    utils.toast("Done");
	                    utils.reload();
	                }
	           }).catch(err => utils.toast("something went wrong !"));
	        } else if(crudindex === 0){

	            const elname = document.getElementById("name");
	            const eliframe = document.getElementById("iframe");

	            const name = elname.value ? elname.value : null;
	            const iframe = eliframe.value ? eliframe.value : null;

	            if(!name || !iframe){
	                utils.toast("fill all the fields !");
	                utils.reload();
	            }

	            utils.fetch("/form/add", {name, iframe}).then((res)=>{
	                if(res.status!=200){
	                    utils.toast("something went wrong !");
	                } else{
	                    utils.toast("Done");
	                    utils.reload();
	                }
	           }).catch(err => utils.toast("something went wrong !"));
	        } else if(crudindex === 4){
	            utils.fetch(`/form/block/${datum_id}`, {}).then((res)=>{
	                if(res.status!=200){
	                    utils.toast("something went wrong !");
	                } else{
	                    utils.toast("Done");
	                    utils.reload();
	                }
	            }).catch(err => utils.toast("something went wrong !"));
	        } else if(crudindex === 5){
	            utils.fetch(`/form/unblock/${datum_id}`, {}).then((res)=>{
	                if(res.status!=200){
	                    utils.toast("something went wrong !");
	                } else{
	                    utils.toast("Done");
	                    utils.reload();
	                }
	            }).catch(err => utils.toast("something went wrong !"));
	        } else{
	            utils.fetch(`/form/delete/${datum_id}`, {}).then((res)=>{
	                if(res.status!=200){
	                    utils.toast("something went wrong !");
	                } else{
	                    utils.toast("Done");
	                    utils.reload();
	                }
	           }).catch(err => utils.toast("something went wrong !"));
	        }
	        
	    }
	};

	const file$e = "ui\\panel\\admin_pages\\Forms.html";

	function create_main_fragment$e(component, ctx) {
		var div, promise, current;

		let info = {
			component,
			ctx,
			current: null,
			pending: create_pending_block$1,
			then: create_then_block$1,
			catch: create_catch_block$1,
			value: 'forms',
			error: 'err',
			blocks: Array(3)
		};

		handlePromise(promise = ctx.getforms, info);

		return {
			c: function create() {
				div = createElement("div");

				info.block.c();
				div.className = "row";
				addLoc(div, file$e, 2, 0, 58);
			},

			m: function mount(target, anchor) {
				insert(target, div, anchor);

				info.block.i(div, info.anchor = null);
				info.mount = () => div;
				info.anchor = null;

				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				info.ctx = ctx;

				if (('getforms' in changed) && promise !== (promise = ctx.getforms) && handlePromise(promise, info)) ; else {
					info.block.p(changed, assign(assign({}, ctx), info.resolved));
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				const countdown = callAfter(outrocallback, 3);
				for (let i = 0; i < 3; i += 1) {
					const block = info.blocks[i];
					if (block) block.o(countdown);
					else countdown();
				}

				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div);
				}

				info.block.d();
				info = null;
			}
		};
	}

	// (92:4) {:catch err}
	function create_catch_block$1(component, ctx) {
		var p, text0, text1_value = ctx.err.message, text1, current;

		return {
			c: function create() {
				p = createElement("p");
				text0 = createText("Error ");
				text1 = createText(text1_value);
				addLoc(p, file$e, 92, 8, 5321);
			},

			m: function mount(target, anchor) {
				insert(target, p, anchor);
				append(p, text0);
				append(p, text1);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.getforms) && text1_value !== (text1_value = ctx.err.message)) {
					setData(text1, text1_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(p);
				}
			}
		};
	}

	// (6:4) {:then forms}
	function create_then_block$1(component, ctx) {
		var div2, div0, h4, text0_value = ctx.crudindex===1 ? "Edit" : ctx.crudindex===0 ? "Create" : "", text0, text1, current_block_type_index, if_block, text2, div1, button, text3_value = ctx.crudindex===1 ? "Update" : ctx.crudindex===0 ? "Add" : ctx.crudindex===2 ? "Delete" : ctx.crudindex===4? "Block" : "Unblock", text3, div2_id_value, text4, text5, div3, a, text6, current;

		var if_block_creators = [
			create_if_block$7,
			create_if_block_1$4,
			create_if_block_2$1,
			create_if_block_3$1,
			create_else_block$4
		];

		var if_blocks = [];

		function select_block_type(ctx) {
			if (ctx.crudindex === 2) return 0;
			if (ctx.crudindex === 4) return 1;
			if (ctx.crudindex === 5) return 2;
			if (ctx.crudindex === 1) return 3;
			return 4;
		}

		current_block_type_index = select_block_type(ctx);
		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](component, ctx);

		function click_handler(event) {
			component.action();
		}

		var table_initial_data = {
		 	highlight: true,
		 	rows: 5,
		 	content: ctx.forms,
		 	search: ["name", "iframe", "id"],
		 	actions: [
	                                            /* ------------------------------------------
	                                                list of all actions for forms data table 
	                                            ------------------------------------------
	                                            */
	                    // ==============================================================================================
	                    // DELETE
	                    // ==============================================================================================
	                    {icon: "delete",tooltip: "delete", action(obj, component) {
	                            var index = 2;
	                           component.fire("modal", {obj, index}); 
	                            
	                        }
	                    }, 
	                    // ==============================================================================================
	                    // EDIT : for dev , admin and mod
	                    // ==============================================================================================
	                    {icon: "edit",tooltip: "edit", action(obj, component) {
	                            var index = 1;
	                            component.fire("modal", {obj, index});    
	                        }
	                    }, 
	                    // ==============================================================================================
	                    // BLOCK STATUS
	                    // ==============================================================================================
	                    {icon: "block",tooltip: "block", action(obj, component) {
	                                var index = 4;
	                                component.fire("modal", {obj, index});
	                        }
	                    },
	                    // ==============================================================================================
	                    // UNBLOCK STATUS
	                    // ==============================================================================================
	                    {icon: "beenhere",tooltip: "unblock", action(obj, component) {
	                                var index = 5;
	                                component.fire("modal", {obj, index});
	                        }
	                    } 
	                ]
		 };
		var table = new Table({
			root: component.root,
			store: component.store,
			data: table_initial_data
		});

		table.on("modal", function(event) {
			component.open(event);
		});

		var i = new Icon({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() }
		});

		function click_handler_1(event) {
			component.fireMe(0);
		}

		return {
			c: function create() {
				div2 = createElement("div");
				div0 = createElement("div");
				h4 = createElement("h4");
				text0 = createText(text0_value);
				text1 = createText("\r\n                        \r\n                        ");
				if_block.c();
				text2 = createText("\r\n                ");
				div1 = createElement("div");
				button = createElement("button");
				text3 = createText(text3_value);
				text4 = createText(" \r\n\r\n        ");
				table._fragment.c();
				text5 = createText("\r\n\r\n        ");
				div3 = createElement("div");
				a = createElement("a");
				text6 = createText("add");
				i._fragment.c();
				addLoc(h4, file$e, 9, 20, 470);
				div0.className = "modal-content";
				addLoc(div0, file$e, 8, 16, 421);
				addListener(button, "click", click_handler);
				button.className = "modal-close waves-effect waves-green btn-flat";
				addLoc(button, file$e, 38, 20, 2177);
				div1.className = "modal-footer";
				addLoc(div1, file$e, 37, 16, 2129);
				div2.id = div2_id_value = ctx.crudindex===1 ? "modaledit" :  ctx.crudindex===0 ? "modalcreate" : ctx.crudindex===4 ? "modalblock" : ctx.crudindex===5 ? "modalunblock" : "modaldelete";
				div2.className = "modal";
				addLoc(div2, file$e, 7, 12, 236);
				addListener(a, "click", click_handler_1);
				a.className = "btn-floating btn-large waves-effect waves-light red";
				addLoc(a, file$e, 88, 14, 5177);
				div3.className = "fixed-action-btn";
				addLoc(div3, file$e, 87, 8, 5131);
			},

			m: function mount(target, anchor) {
				insert(target, div2, anchor);
				append(div2, div0);
				append(div0, h4);
				append(h4, text0);
				append(div0, text1);
				if_blocks[current_block_type_index].m(div0, null);
				append(div2, text2);
				append(div2, div1);
				append(div1, button);
				append(button, text3);
				insert(target, text4, anchor);
				table._mount(target, anchor);
				insert(target, text5, anchor);
				insert(target, div3, anchor);
				append(div3, a);
				append(i._slotted.default, text6);
				i._mount(a, null);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((!current || changed.crudindex) && text0_value !== (text0_value = ctx.crudindex===1 ? "Edit" : ctx.crudindex===0 ? "Create" : "")) {
					setData(text0, text0_value);
				}

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
					if_block.m(div0, null);
				}

				if ((!current || changed.crudindex) && text3_value !== (text3_value = ctx.crudindex===1 ? "Update" : ctx.crudindex===0 ? "Add" : ctx.crudindex===2 ? "Delete" : ctx.crudindex===4? "Block" : "Unblock")) {
					setData(text3, text3_value);
				}

				if ((!current || changed.crudindex) && div2_id_value !== (div2_id_value = ctx.crudindex===1 ? "modaledit" :  ctx.crudindex===0 ? "modalcreate" : ctx.crudindex===4 ? "modalblock" : ctx.crudindex===5 ? "modalunblock" : "modaldelete")) {
					div2.id = div2_id_value;
				}

				var table_changes = {};
				if (changed.getforms) table_changes.content = ctx.forms;
				table._set(table_changes);
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 3);

				if (if_block) if_block.o(outrocallback);
				else outrocallback();

				if (table) table._fragment.o(outrocallback);
				if (i) i._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div2);
				}

				if_blocks[current_block_type_index].d();
				removeListener(button, "click", click_handler);
				if (detach) {
					detachNode(text4);
				}

				table.destroy(detach);
				if (detach) {
					detachNode(text5);
					detachNode(div3);
				}

				i.destroy();
				removeListener(a, "click", click_handler_1);
			}
		};
	}

	// (33:24) {:else}
	function create_else_block$4(component, ctx) {
		var text, current;

		var input0_initial_data = {
		 	col: "s12",
		 	label: "name",
		 	id: "name",
		 	type: "text"
		 };
		var input0 = new Input({
			root: component.root,
			store: component.store,
			data: input0_initial_data
		});

		var input1_initial_data = {
		 	col: "s12",
		 	label: "iframe",
		 	id: "iframe",
		 	type: "text"
		 };
		var input1 = new Input({
			root: component.root,
			store: component.store,
			data: input1_initial_data
		});

		return {
			c: function create() {
				input0._fragment.c();
				text = createText("\r\n                            ");
				input1._fragment.c();
			},

			m: function mount(target, anchor) {
				input0._mount(target, anchor);
				insert(target, text, anchor);
				input1._mount(target, anchor);
				current = true;
			},

			p: noop,

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 2);

				if (input0) input0._fragment.o(outrocallback);
				if (input1) input1._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				input0.destroy(detach);
				if (detach) {
					detachNode(text);
				}

				input1.destroy(detach);
			}
		};
	}

	// (24:49) 
	function create_if_block_3$1(component, ctx) {
		var if_block_anchor, current;

		var if_block = (ctx.objModal) && create_if_block_4$1(component, ctx);

		return {
			c: function create() {
				if (if_block) if_block.c();
				if_block_anchor = createComment();
			},

			m: function mount(target, anchor) {
				if (if_block) if_block.m(target, anchor);
				insert(target, if_block_anchor, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				if (ctx.objModal) {
					if (if_block) {
						if_block.p(changed, ctx);
					} else {
						if_block = create_if_block_4$1(component, ctx);
						if (if_block) if_block.c();
					}

					if_block.i(if_block_anchor.parentNode, if_block_anchor);
				} else if (if_block) {
					if_block.o(function() {
						if_block.d(1);
						if_block = null;
					});
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
				if (if_block) if_block.d(detach);
				if (detach) {
					detachNode(if_block_anchor);
				}
			}
		};
	}

	// (20:49) 
	function create_if_block_2$1(component, ctx) {
		var h4, text1, p, text2, strong, text3, text4_value = ctx.objModal.id, text4, text5, current;

		return {
			c: function create() {
				h4 = createElement("h4");
				h4.textContent = "Confirm Unblock";
				text1 = createText("\r\n                            ");
				p = createElement("p");
				text2 = createText("Do you really want to unblock the form ");
				strong = createElement("strong");
				text3 = createText("#");
				text4 = createText(text4_value);
				text5 = createText(" ?");
				addLoc(h4, file$e, 20, 28, 1064);
				addLoc(strong, file$e, 21, 70, 1160);
				addLoc(p, file$e, 21, 28, 1118);
			},

			m: function mount(target, anchor) {
				insert(target, h4, anchor);
				insert(target, text1, anchor);
				insert(target, p, anchor);
				append(p, text2);
				append(p, strong);
				append(strong, text3);
				append(strong, text4);
				append(p, text5);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.objModal) && text4_value !== (text4_value = ctx.objModal.id)) {
					setData(text4, text4_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(h4);
					detachNode(text1);
					detachNode(p);
				}
			}
		};
	}

	// (16:49) 
	function create_if_block_1$4(component, ctx) {
		var h4, text1, p, text2, strong, text3, text4_value = ctx.objModal.id, text4, text5, current;

		return {
			c: function create() {
				h4 = createElement("h4");
				h4.textContent = "Confirm Block";
				text1 = createText("\r\n                            ");
				p = createElement("p");
				text2 = createText("Do you really want to block the form ");
				strong = createElement("strong");
				text3 = createText("#");
				text4 = createText(text4_value);
				text5 = createText(" ?");
				addLoc(h4, file$e, 16, 28, 852);
				addLoc(strong, file$e, 17, 68, 944);
				addLoc(p, file$e, 17, 28, 904);
			},

			m: function mount(target, anchor) {
				insert(target, h4, anchor);
				insert(target, text1, anchor);
				insert(target, p, anchor);
				append(p, text2);
				append(p, strong);
				append(strong, text3);
				append(strong, text4);
				append(p, text5);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.objModal) && text4_value !== (text4_value = ctx.objModal.id)) {
					setData(text4, text4_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(h4);
					detachNode(text1);
					detachNode(p);
				}
			}
		};
	}

	// (12:24) {#if crudindex === 2}
	function create_if_block$7(component, ctx) {
		var h4, text1, p, text2, strong, text3, text4_value = ctx.objModal.id, text4, text5, current;

		return {
			c: function create() {
				h4 = createElement("h4");
				h4.textContent = "Confirm Delete";
				text1 = createText("\r\n                            ");
				p = createElement("p");
				text2 = createText("Do you really want to delete the form ");
				strong = createElement("strong");
				text3 = createText("#");
				text4 = createText(text4_value);
				text5 = createText(" ?");
				addLoc(h4, file$e, 12, 28, 638);
				addLoc(strong, file$e, 13, 69, 732);
				addLoc(p, file$e, 13, 28, 691);
			},

			m: function mount(target, anchor) {
				insert(target, h4, anchor);
				insert(target, text1, anchor);
				insert(target, p, anchor);
				append(p, text2);
				append(p, strong);
				append(strong, text3);
				append(strong, text4);
				append(p, text5);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.objModal) && text4_value !== (text4_value = ctx.objModal.id)) {
					setData(text4, text4_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(h4);
					detachNode(text1);
					detachNode(p);
				}
			}
		};
	}

	// (26:32) {#if objModal}
	function create_if_block_4$1(component, ctx) {
		var text0, text1, div, text2, raw_value = ctx.objModal.iframe, raw_before, raw_after, current;

		var input0_initial_data = {
		 	col: "s12",
		 	label: "name",
		 	id: "name",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.name : ""
		 };
		var input0 = new Input({
			root: component.root,
			store: component.store,
			data: input0_initial_data
		});

		var input1_initial_data = {
		 	col: "s12",
		 	label: "iframe",
		 	id: "iframe",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.iframe : ""
		 };
		var input1 = new Input({
			root: component.root,
			store: component.store,
			data: input1_initial_data
		});

		return {
			c: function create() {
				input0._fragment.c();
				text0 = createText("\r\n                                    ");
				input1._fragment.c();
				text1 = createText("\r\n                                    ");
				div = createElement("div");
				text2 = createText("\r\n                                        ");
				raw_before = createElement('noscript');
				raw_after = createElement('noscript');
				div.className = "divider";
				addLoc(div, file$e, 28, 36, 1672);
			},

			m: function mount(target, anchor) {
				input0._mount(target, anchor);
				insert(target, text0, anchor);
				input1._mount(target, anchor);
				insert(target, text1, anchor);
				insert(target, div, anchor);
				insert(target, text2, anchor);
				insert(target, raw_before, anchor);
				raw_before.insertAdjacentHTML("afterend", raw_value);
				insert(target, raw_after, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				var input0_changes = {};
				if (changed.crudindex || changed.objModal) input0_changes.value = ctx.crudindex === 1 ? ctx.objModal.name : "";
				input0._set(input0_changes);

				var input1_changes = {};
				if (changed.crudindex || changed.objModal) input1_changes.value = ctx.crudindex === 1 ? ctx.objModal.iframe : "";
				input1._set(input1_changes);

				if ((!current || changed.objModal) && raw_value !== (raw_value = ctx.objModal.iframe)) {
					detachBetween(raw_before, raw_after);
					raw_before.insertAdjacentHTML("afterend", raw_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 2);

				if (input0) input0._fragment.o(outrocallback);
				if (input1) input1._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				input0.destroy(detach);
				if (detach) {
					detachNode(text0);
				}

				input1.destroy(detach);
				if (detach) {
					detachNode(text1);
					detachNode(div);
					detachNode(text2);
					detachBetween(raw_before, raw_after);
					detachNode(raw_before);
					detachNode(raw_after);
				}
			}
		};
	}

	// (4:21)           <Loading small/>      {:then forms}
	function create_pending_block$1(component, ctx) {
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

	function Forms(options) {
		this._debugName = '<Forms>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data$c(), options.data);
		if (!('getforms' in this._state)) console.warn("<Forms> was created without expected data property 'getforms'");
		if (!('crudindex' in this._state)) console.warn("<Forms> was created without expected data property 'crudindex'");
		if (!('objModal' in this._state)) console.warn("<Forms> was created without expected data property 'objModal'");
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$e(this, this._state);

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}

		this._intro = true;
	}

	assign(Forms.prototype, protoDev);
	assign(Forms.prototype, methods$8);

	Forms.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\panel\admin_pages\LiveChat.html generated by Svelte v2.16.1 */

	function create_main_fragment$f(component, ctx) {

		return {
			c: noop,

			m: noop,

			p: noop,

			i: noop,

			o: run,

			d: noop
		};
	}

	function LiveChat(options) {
		this._debugName = '<LiveChat>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign({}, options.data);
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$f(this, this._state);

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);
		}

		this._intro = true;
	}

	assign(LiveChat.prototype, protoDev);

	LiveChat.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\panel\admin_pages\CommentControlCenter.html generated by Svelte v2.16.1 */

	function data$d(){
	    return {
	        objModal: null,
	        crudindex: 0, // 1 : edit , 0 : create , 2 : delete , 4 : block , 5 : unblock
	        getcomments: utils.fetch("/comment/getAll")
	        .then(response => {
	                var comments = response.body;
	                var rows = [];
	                for(var cmnt of comments) {
	                        // [ CREATE , DELETE , EDIT , BLOCK , UNBLOCK ]
	                        cmnt.actions = [
	                            [7].includes(cdsuser.access), // only dev can create new comment
	                            [5, 7].includes(cdsuser.access), 
	                            [3, 5, 7].includes(cdsuser.access), // dev , admin and mod can edit the comment 
	                            [5, 7].includes(cdsuser.access) && cmnt.status === 1,
	                            [5, 7].includes(cdsuser.access) && cmnt.status === 0,

	                        ];

	                        var cdate = cmnt.created_at.split("T")[0];
	                        var ctime = cmnt.created_at.split("T")[1].slice(0,8);
	                        cmnt.created_at = cdate + " at " + ctime; 

	                        var udate = cmnt.updated_at.split("T")[0];
	                        var utime = cmnt.updated_at.split("T")[1].slice(0,8);
	                        cmnt.updated_at = udate + " at " + utime; 
	                        
	                        // cmnt.created_at = moment(cmnt.created_at).fromNow()
	                        // cmnt.updated_at = moment(cmnt.updated_at).fromNow()
	                        
	                        rows.push(cmnt);
	                }
	                return rows;
	            })
	            .catch(err => utils.toast("something went wrong !")),
	    }
	}
	var methods$9 = {
	    open({obj, index}){
	        this.set({crudindex: index, objModal: obj});
	        var elems = document.querySelector('.modal');
	        var instances = M.Modal.init(elems, {});
	        instances.open();
	    },
	    action(id, post_id){
	        
	        var {crudindex} = this.get();
	        // get down the road with crudindex!!!
	        if(crudindex === 1){
	            const elname = document.getElementById("name");
	            const elemail = document.getElementById("email");
	            const elcontent = document.getElementById("content");

	            const name = elname.value ? elname.value : null;
	            const email = elemail.value ? elemail.value : null;
	            const content = elcontent.value ? elcontent.value : null;
	            
	            utils.fetch("/comment/edit", {name, email, content, id}).then((res)=>{
	                if(res.status!=200){
	                    utils.toast("something went wrong !");
	                } else{
	                    utils.toast("Done");
	                    utils.reload();
	                }
	           }).catch(err => utils.toast("something went wrong !"));
	        } else if(crudindex === 0){

	            const elname = document.getElementById("name");
	            const elemail = document.getElementById("email");
	            const elcontent = document.getElementById("content");

	            const name = elname.value ? elname.value : null;
	            const email = elemail.value ? elemail.value : null;
	            const content = elcontent.value ? elcontent.value : null;

	            if(!name || !email || !content){
	                utils.toast("fill all the fields !");
	                utils.reload();
	            }
	            
	            utils.fetch("/comment/add", {name, email, content, id, post_id}).then((res)=>{
	                if(res.status!=200){
	                    utils.toast("something went wrong !");
	                } else{
	                    utils.toast("Done");
	                    utils.reload();
	                }
	           }).catch(err => utils.toast("something went wrong !"));
	        } else if(crudindex === 4){
	            utils.fetch(`/comment/block/${id}`, {}).then((res)=>{
	                if(res.status!=200){
	                    utils.toast("something went wrong !");
	                } else{
	                    utils.toast("Done");
	                    utils.reload();
	                }
	            }).catch(err => utils.toast("something went wrong !"));
	        } else if(crudindex === 5){
	            utils.fetch(`/comment/unblock/${id}`, {}).then((res)=>{
	                if(res.status!=200){
	                    utils.toast("something went wrong !");
	                } else{
	                    utils.toast("Done");
	                    utils.reload();
	                }
	            }).catch(err => utils.toast("something went wrong !"));
	        } else{
	            utils.fetch(`/comment/delete/${id}`, {}).then((res)=>{
	                if(res.status!=200){
	                    utils.toast("something went wrong !");
	                } else{
	                    utils.toast("Done");
	                    utils.reload();
	                }
	           }).catch(err => utils.toast("something went wrong !"));
	        }
	        
	    }
	};

	const file$g = "ui\\panel\\admin_pages\\CommentControlCenter.html";

	function create_main_fragment$g(component, ctx) {
		var div, promise, current;

		let info = {
			component,
			ctx,
			current: null,
			pending: create_pending_block$2,
			then: create_then_block$2,
			catch: create_catch_block$2,
			value: 'comments',
			error: 'err',
			blocks: Array(3)
		};

		handlePromise(promise = ctx.getcomments, info);

		return {
			c: function create() {
				div = createElement("div");

				info.block.c();
				div.className = "row";
				addLoc(div, file$g, 2, 0, 42);
			},

			m: function mount(target, anchor) {
				insert(target, div, anchor);

				info.block.i(div, info.anchor = null);
				info.mount = () => div;
				info.anchor = null;

				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				info.ctx = ctx;

				if (('getcomments' in changed) && promise !== (promise = ctx.getcomments) && handlePromise(promise, info)) ; else {
					info.block.p(changed, assign(assign({}, ctx), info.resolved));
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				const countdown = callAfter(outrocallback, 3);
				for (let i = 0; i < 3; i += 1) {
					const block = info.blocks[i];
					if (block) block.o(countdown);
					else countdown();
				}

				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div);
				}

				info.block.d();
				info = null;
			}
		};
	}

	// (99:4) {:catch err}
	function create_catch_block$2(component, ctx) {
		var p, text0, text1_value = ctx.err.message, text1, current;

		return {
			c: function create() {
				p = createElement("p");
				text0 = createText("Error ");
				text1 = createText(text1_value);
				addLoc(p, file$g, 99, 8, 6283);
			},

			m: function mount(target, anchor) {
				insert(target, p, anchor);
				append(p, text0);
				append(p, text1);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.getcomments) && text1_value !== (text1_value = ctx.err.message)) {
					setData(text1, text1_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(p);
				}
			}
		};
	}

	// (6:4) {:then comments}
	function create_then_block$2(component, ctx) {
		var div2, div0, h4, text0_value = ctx.crudindex===1 ? "Edit" : ctx.crudindex===0 ? "Create" : "", text0, text1, current_block_type_index, if_block, text2, div1, button, text3_value = ctx.crudindex===1 ? "Update" : ctx.crudindex===0 ? "Add" : ctx.crudindex===2 ? "Delete" : ctx.crudindex===4? "Block" : "Unblock", text3, div2_id_value, text4, current;

		var if_block_creators = [
			create_if_block$8,
			create_if_block_1$5,
			create_if_block_2$2,
			create_else_block$5
		];

		var if_blocks = [];

		function select_block_type(ctx) {
			if (ctx.crudindex === 2) return 0;
			if (ctx.crudindex === 4) return 1;
			if (ctx.crudindex === 5) return 2;
			return 3;
		}

		current_block_type_index = select_block_type(ctx);
		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](component, ctx);

		function click_handler(event) {
			component.action(ctx.objModal.id, ctx.objModal.post_id);
		}

		var table_initial_data = {
		 	highlight: true,
		 	rows: 5,
		 	content: ctx.comments,
		 	search: ["name", "content", "email", "cuid", "id", "post_id"],
		 	actions: [
	                                            /* ------------------------------------------
	                                                list of all actions for comment data table 
	                                            ------------------------------------------
	                                            */
	                    // ==============================================================================================
	                    // CREATE : only for dev
	                    // ==============================================================================================
	                    {icon: "fiber_new",tooltip: "create", action(obj, component) {
	                            var index = 0;
	                            component.fire("modal", {obj, index});
	                        }
	                    }, 
	                    // ==============================================================================================
	                    // DELETE
	                    // ==============================================================================================
	                    {icon: "delete",tooltip: "delete", action(obj, component) {
	                            var index = 2;
	                           component.fire("modal", {obj, index}); 
	                            
	                        }
	                    }, 
	                    // ==============================================================================================
	                    // EDIT : for dev , admin and mod
	                    // ==============================================================================================
	                    {icon: "edit",tooltip: "edit", action(obj, component) {
	                            var index = 1;
	                            component.fire("modal", {obj, index});    
	                        }
	                    }, 
	                    // ==============================================================================================
	                    // BLOCK STATUS
	                    // ==============================================================================================
	                    {icon: "block",tooltip: "block", action(obj, component) {
	                                var index = 4;
	                                component.fire("modal", {obj, index});
	                        }
	                    },
	                    // ==============================================================================================
	                    // UNBLOCK STATUS
	                    // ==============================================================================================
	                    {icon: "beenhere",tooltip: "unblock", action(obj, component) {
	                                var index = 5;
	                                component.fire("modal", {obj, index});
	                        }
	                    } 
	                ]
		 };
		var table = new Table({
			root: component.root,
			store: component.store,
			data: table_initial_data
		});

		table.on("modal", function(event) {
			component.open(event);
		});

		return {
			c: function create() {
				div2 = createElement("div");
				div0 = createElement("div");
				h4 = createElement("h4");
				text0 = createText(text0_value);
				text1 = createText("\r\n                        \r\n                        ");
				if_block.c();
				text2 = createText("\r\n                ");
				div1 = createElement("div");
				button = createElement("button");
				text3 = createText(text3_value);
				text4 = createText(" \r\n\r\n        ");
				table._fragment.c();
				addLoc(h4, file$g, 10, 20, 462);
				div0.className = "modal-content";
				addLoc(div0, file$g, 9, 16, 413);
				addListener(button, "click", click_handler);
				button.className = "modal-close waves-effect waves-green btn-flat";
				addLoc(button, file$g, 42, 20, 2720);
				div1.className = "modal-footer";
				addLoc(div1, file$g, 41, 16, 2672);
				div2.id = div2_id_value = ctx.crudindex===1 ? "modaledit" :  ctx.crudindex===0 ? "modalcreate" : ctx.crudindex===4 ? "modalblock" : ctx.crudindex===5 ? "modalunblock" : "modaldelete";
				div2.className = "modal";
				addLoc(div2, file$g, 8, 12, 228);
			},

			m: function mount(target, anchor) {
				insert(target, div2, anchor);
				append(div2, div0);
				append(div0, h4);
				append(h4, text0);
				append(div0, text1);
				if_blocks[current_block_type_index].m(div0, null);
				append(div2, text2);
				append(div2, div1);
				append(div1, button);
				append(button, text3);
				insert(target, text4, anchor);
				table._mount(target, anchor);
				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				if ((!current || changed.crudindex) && text0_value !== (text0_value = ctx.crudindex===1 ? "Edit" : ctx.crudindex===0 ? "Create" : "")) {
					setData(text0, text0_value);
				}

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
					if_block.m(div0, null);
				}

				if ((!current || changed.crudindex) && text3_value !== (text3_value = ctx.crudindex===1 ? "Update" : ctx.crudindex===0 ? "Add" : ctx.crudindex===2 ? "Delete" : ctx.crudindex===4? "Block" : "Unblock")) {
					setData(text3, text3_value);
				}

				if ((!current || changed.crudindex) && div2_id_value !== (div2_id_value = ctx.crudindex===1 ? "modaledit" :  ctx.crudindex===0 ? "modalcreate" : ctx.crudindex===4 ? "modalblock" : ctx.crudindex===5 ? "modalunblock" : "modaldelete")) {
					div2.id = div2_id_value;
				}

				var table_changes = {};
				if (changed.getcomments) table_changes.content = ctx.comments;
				table._set(table_changes);
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 2);

				if (if_block) if_block.o(outrocallback);
				else outrocallback();

				if (table) table._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div2);
				}

				if_blocks[current_block_type_index].d();
				removeListener(button, "click", click_handler);
				if (detach) {
					detachNode(text4);
				}

				table.destroy(detach);
			}
		};
	}

	// (25:24) {:else}
	function create_else_block$5(component, ctx) {
		var div, if_block_anchor, current;

		var if_block = (ctx.objModal) && create_if_block_3$2(component, ctx);

		var card_initial_data = { col: "s12 m10 offset-m1 l10 offset-l1" };
		var card = new Card({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: card_initial_data
		});

		return {
			c: function create() {
				div = createElement("div");
				if (if_block) if_block.c();
				if_block_anchor = createComment();
				card._fragment.c();
				div.className = "row";
				addLoc(div, file$g, 25, 28, 1236);
			},

			m: function mount(target, anchor) {
				insert(target, div, anchor);
				if (if_block) if_block.m(card._slotted.default, null);
				append(card._slotted.default, if_block_anchor);
				card._mount(div, null);
				current = true;
			},

			p: function update(changed, ctx) {
				if (ctx.objModal) {
					if (if_block) {
						if_block.p(changed, ctx);
					} else {
						if_block = create_if_block_3$2(component, ctx);
						if (if_block) if_block.c();
					}

					if_block.i(if_block_anchor.parentNode, if_block_anchor);
				} else if (if_block) {
					if_block.o(function() {
						if_block.d(1);
						if_block = null;
					});
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 2);

				if (if_block) if_block.o(outrocallback);
				else outrocallback();

				if (card) card._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div);
				}

				if (if_block) if_block.d();
				card.destroy();
			}
		};
	}

	// (21:49) 
	function create_if_block_2$2(component, ctx) {
		var h4, text1, p, text2, text3_value = ctx.objModal.id, text3, text4, current;

		return {
			c: function create() {
				h4 = createElement("h4");
				h4.textContent = "Confirm Unblock";
				text1 = createText("\r\n                            ");
				p = createElement("p");
				text2 = createText("Do you really want to unblock the comment #");
				text3 = createText(text3_value);
				text4 = createText(" ?");
				addLoc(h4, file$g, 21, 28, 1028);
				addLoc(p, file$g, 22, 28, 1082);
			},

			m: function mount(target, anchor) {
				insert(target, h4, anchor);
				insert(target, text1, anchor);
				insert(target, p, anchor);
				append(p, text2);
				append(p, text3);
				append(p, text4);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.objModal) && text3_value !== (text3_value = ctx.objModal.id)) {
					setData(text3, text3_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(h4);
					detachNode(text1);
					detachNode(p);
				}
			}
		};
	}

	// (17:49) 
	function create_if_block_1$5(component, ctx) {
		var h4, text1, p, text2, text3_value = ctx.objModal.id, text3, text4, current;

		return {
			c: function create() {
				h4 = createElement("h4");
				h4.textContent = "Confirm Block";
				text1 = createText("\r\n                            ");
				p = createElement("p");
				text2 = createText("Do you really want to block the comment #");
				text3 = createText(text3_value);
				text4 = createText(" ?");
				addLoc(h4, file$g, 17, 28, 830);
				addLoc(p, file$g, 18, 28, 882);
			},

			m: function mount(target, anchor) {
				insert(target, h4, anchor);
				insert(target, text1, anchor);
				insert(target, p, anchor);
				append(p, text2);
				append(p, text3);
				append(p, text4);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.objModal) && text3_value !== (text3_value = ctx.objModal.id)) {
					setData(text3, text3_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(h4);
					detachNode(text1);
					detachNode(p);
				}
			}
		};
	}

	// (13:24) {#if crudindex === 2}
	function create_if_block$8(component, ctx) {
		var h4, text1, p, text2, text3_value = ctx.objModal.id, text3, text4, current;

		return {
			c: function create() {
				h4 = createElement("h4");
				h4.textContent = "Confirm Delete";
				text1 = createText("\r\n                            ");
				p = createElement("p");
				text2 = createText("Do you really want to delete the comment #");
				text3 = createText(text3_value);
				text4 = createText(" ?");
				addLoc(h4, file$g, 13, 28, 630);
				addLoc(p, file$g, 14, 28, 683);
			},

			m: function mount(target, anchor) {
				insert(target, h4, anchor);
				insert(target, text1, anchor);
				insert(target, p, anchor);
				append(p, text2);
				append(p, text3);
				append(p, text4);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.objModal) && text3_value !== (text3_value = ctx.objModal.id)) {
					setData(text3, text3_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(h4);
					detachNode(text1);
					detachNode(p);
				}
			}
		};
	}

	// (28:36) {#if objModal}
	function create_if_block_3$2(component, ctx) {
		var a, text0_value = ctx.objModal.title, text0, a_href_value, text1, text2, text3, text4, text5, text6, textarea, textarea_value_value, text7, label, current;

		var input0_initial_data = {
		 	col: "s12",
		 	label: "cuid",
		 	id: "cuid",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.cuid : "",
		 	disabled: true
		 };
		var input0 = new Input({
			root: component.root,
			store: component.store,
			data: input0_initial_data
		});

		var input1_initial_data = {
		 	col: "s12",
		 	label: "created_at",
		 	id: "created_at",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.created_at : "",
		 	disabled: true
		 };
		var input1 = new Input({
			root: component.root,
			store: component.store,
			data: input1_initial_data
		});

		var input2_initial_data = {
		 	col: "s12",
		 	label: "updated_at",
		 	id: "updated_at",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.updated_at : "",
		 	disabled: true
		 };
		var input2 = new Input({
			root: component.root,
			store: component.store,
			data: input2_initial_data
		});

		var input3_initial_data = {
		 	col: "s12",
		 	label: "Email",
		 	id: "email",
		 	type: "email",
		 	value: ctx.crudindex === 1 ? ctx.objModal.email : ""
		 };
		var input3 = new Input({
			root: component.root,
			store: component.store,
			data: input3_initial_data
		});

		var input4_initial_data = {
		 	col: "s12",
		 	label: "name",
		 	id: "name",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.name : ""
		 };
		var input4 = new Input({
			root: component.root,
			store: component.store,
			data: input4_initial_data
		});

		return {
			c: function create() {
				a = createElement("a");
				text0 = createText(text0_value);
				text1 = createText("\r\n                                        ");
				input0._fragment.c();
				text2 = createText("\r\n                                        ");
				input1._fragment.c();
				text3 = createText("\r\n                                        ");
				input2._fragment.c();
				text4 = createText("\r\n                                        ");
				input3._fragment.c();
				text5 = createText("\r\n                                        ");
				input4._fragment.c();
				text6 = createText("\r\n                                        ");
				textarea = createElement("textarea");
				text7 = createText("\r\n                                        ");
				label = createElement("label");
				label.textContent = "Content";
				a.href = a_href_value = "/content/" + ctx.objModal.title;
				addLoc(a, file$g, 28, 38, 1423);
				textarea.id = "content";
				textarea.className = "materialize-textarea";
				textarea.value = textarea_value_value = ctx.crudindex === 1 ? ctx.objModal.content : "";
				addLoc(textarea, file$g, 34, 40, 2296);
				label.htmlFor = "content";
				addLoc(label, file$g, 35, 40, 2443);
			},

			m: function mount(target, anchor) {
				insert(target, a, anchor);
				append(a, text0);
				insert(target, text1, anchor);
				input0._mount(target, anchor);
				insert(target, text2, anchor);
				input1._mount(target, anchor);
				insert(target, text3, anchor);
				input2._mount(target, anchor);
				insert(target, text4, anchor);
				input3._mount(target, anchor);
				insert(target, text5, anchor);
				input4._mount(target, anchor);
				insert(target, text6, anchor);
				insert(target, textarea, anchor);
				insert(target, text7, anchor);
				insert(target, label, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((!current || changed.objModal) && text0_value !== (text0_value = ctx.objModal.title)) {
					setData(text0, text0_value);
				}

				if ((!current || changed.objModal) && a_href_value !== (a_href_value = "/content/" + ctx.objModal.title)) {
					a.href = a_href_value;
				}

				var input0_changes = {};
				if (changed.crudindex || changed.objModal) input0_changes.value = ctx.crudindex === 1 ? ctx.objModal.cuid : "";
				input0._set(input0_changes);

				var input1_changes = {};
				if (changed.crudindex || changed.objModal) input1_changes.value = ctx.crudindex === 1 ? ctx.objModal.created_at : "";
				input1._set(input1_changes);

				var input2_changes = {};
				if (changed.crudindex || changed.objModal) input2_changes.value = ctx.crudindex === 1 ? ctx.objModal.updated_at : "";
				input2._set(input2_changes);

				var input3_changes = {};
				if (changed.crudindex || changed.objModal) input3_changes.value = ctx.crudindex === 1 ? ctx.objModal.email : "";
				input3._set(input3_changes);

				var input4_changes = {};
				if (changed.crudindex || changed.objModal) input4_changes.value = ctx.crudindex === 1 ? ctx.objModal.name : "";
				input4._set(input4_changes);

				if ((!current || changed.crudindex || changed.objModal) && textarea_value_value !== (textarea_value_value = ctx.crudindex === 1 ? ctx.objModal.content : "")) {
					textarea.value = textarea_value_value;
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 5);

				if (input0) input0._fragment.o(outrocallback);
				if (input1) input1._fragment.o(outrocallback);
				if (input2) input2._fragment.o(outrocallback);
				if (input3) input3._fragment.o(outrocallback);
				if (input4) input4._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(a);
					detachNode(text1);
				}

				input0.destroy(detach);
				if (detach) {
					detachNode(text2);
				}

				input1.destroy(detach);
				if (detach) {
					detachNode(text3);
				}

				input2.destroy(detach);
				if (detach) {
					detachNode(text4);
				}

				input3.destroy(detach);
				if (detach) {
					detachNode(text5);
				}

				input4.destroy(detach);
				if (detach) {
					detachNode(text6);
					detachNode(textarea);
					detachNode(text7);
					detachNode(label);
				}
			}
		};
	}

	// (4:24)           <Loading small/>      {:then comments}
	function create_pending_block$2(component, ctx) {
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

	function CommentControlCenter(options) {
		this._debugName = '<CommentControlCenter>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data$d(), options.data);
		if (!('getcomments' in this._state)) console.warn("<CommentControlCenter> was created without expected data property 'getcomments'");
		if (!('crudindex' in this._state)) console.warn("<CommentControlCenter> was created without expected data property 'crudindex'");
		if (!('objModal' in this._state)) console.warn("<CommentControlCenter> was created without expected data property 'objModal'");
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$g(this, this._state);

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}

		this._intro = true;
	}

	assign(CommentControlCenter.prototype, protoDev);
	assign(CommentControlCenter.prototype, methods$9);

	CommentControlCenter.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\panel\admin_pages\PortalControlCenter.html generated by Svelte v2.16.1 */

	function create_main_fragment$h(component, ctx) {

		return {
			c: noop,

			m: noop,

			p: noop,

			i: noop,

			o: run,

			d: noop
		};
	}

	function PortalControlCenter(options) {
		this._debugName = '<PortalControlCenter>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign({}, options.data);
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$h(this, this._state);

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);
		}

		this._intro = true;
	}

	assign(PortalControlCenter.prototype, protoDev);

	PortalControlCenter.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\panel\admin_pages\ReservedConsultations.html generated by Svelte v2.16.1 */

	function create_main_fragment$i(component, ctx) {

		return {
			c: noop,

			m: noop,

			p: noop,

			i: noop,

			o: run,

			d: noop
		};
	}

	function ReservedConsultations(options) {
		this._debugName = '<ReservedConsultations>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign({}, options.data);
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$i(this, this._state);

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);
		}

		this._intro = true;
	}

	assign(ReservedConsultations.prototype, protoDev);

	ReservedConsultations.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\tags\Editor.html generated by Svelte v2.16.1 */

	// import EasyImage from '@ckeditor/ckeditor5-easy-image/src/easyimage';

	function data$e() {
	    return {
	        initial: "",
	        id: "editor",
	        editor: null,
	    }
	}
	function oncreate$5() {
	    const self = this;
	    const { id } = self.get();
	    const { initial } = this.get();
	    DecoupledEditor
	        .create( document.querySelector( `#${id}` ), {
	            // plugins: [ EasyImage ],
	            // toolbar: [ 'imageUpload' ],

	            // cloudServices: {
	            //         tokenUrl: 'https://example.com/cs-token-endpoint',
	            //         uploadUrl: 'https://your-organization-id.cke-cs.com/easyimage/upload/'
	            //     }
	        })
	        .then( editor => {
	            const toolbarContainer = document.getElementById( `${id}-toolbar-container` );
	            toolbarContainer.appendChild( editor.ui.view.toolbar.element );
	            self.set({ editor });
	            editor.setData(initial);
	        })
	        .catch( error => {
	            console.error( error );
	        });
	}
	const file$j = "ui\\tags\\Editor.html";

	function create_main_fragment$j(component, ctx) {
		var div0, div0_id_value, text0, div1, text1, current;

		return {
			c: function create() {
				div0 = createElement("div");
				text0 = createText("\r\n\r\n");
				div1 = createElement("div");
				text1 = createText(ctx.initial);
				div0.id = div0_id_value = "" + ctx.id + "-toolbar-container";
				addLoc(div0, file$j, 0, 0, 0);
				div1.id = ctx.id;
				addLoc(div1, file$j, 2, 0, 43);
			},

			m: function mount(target, anchor) {
				insert(target, div0, anchor);
				insert(target, text0, anchor);
				insert(target, div1, anchor);
				append(div1, text1);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.id) && div0_id_value !== (div0_id_value = "" + ctx.id + "-toolbar-container")) {
					div0.id = div0_id_value;
				}

				if (changed.initial) {
					setData(text1, ctx.initial);
				}

				if (changed.id) {
					div1.id = ctx.id;
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div0);
					detachNode(text0);
					detachNode(div1);
				}
			}
		};
	}

	function Editor(options) {
		this._debugName = '<Editor>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data$e(), options.data);
		if (!('id' in this._state)) console.warn("<Editor> was created without expected data property 'id'");
		if (!('initial' in this._state)) console.warn("<Editor> was created without expected data property 'initial'");
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$j(this, this._state);

		this.root._oncreate.push(() => {
			oncreate$5.call(this);
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

	assign(Editor.prototype, protoDev);

	Editor.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\panel\admin_pages\ContentControlCenter.html generated by Svelte v2.16.1 */

	function data$f() {
	    return {        
	         kos(currentPage){
	        const selfi = this;
	        const getPages = selfi.getPages;
	        Promise.resolve(getPages).then(pages =>{
	            for(var page of pages){
	                   if (page.id === currentPage.id){
	                       break;
	                   }
	            }
	            if (document.getElementById("cover").files[0]);
	        });
	        selfi.update = true;
	    },
	        chips:null,
	        update: false,
	        feditor:null,
	        eneditor:null,
	        utils,
	        currentRoute: null,
	        defaultRoute: null,
	        getRoutes: utils.fetch("/route/all")
	        .then(res => {
	            if(res.status != 200)
	                throw "not ok";
	            else {
	                // route { items: [{name}], name, access }
	                
	                var routes = res.body;
	                var rows = [];
	                for(var rt of routes) {
	                    rt.name = rt.title;
	                    if(rt.access <= cdsuser.access) {
	                        rows.push(rt);
	                    }
	                }
	                return rows;
	            }
	               
	        })
	        .catch(err => utils.toast("something went wrong !")),
	        getPages: utils.fetch("/page/all")
	        .then(res => {
	            if(res.status != 200)
	                throw "not ok";
	            else
	               return res.body;
	        })
	        .catch(err => utils.toast("something went wrong !")),
	    }
	}
	var methods$a = {
	    post(){
	        var chipsTag = this.get().chips[0].chipsData;
	        var s=[];
	        for (var i of chipsTag){
	                s.push(i.tag);
	        }
	        s = s.join(",");
	        var formdata= new FormData();
	        if(document.getElementById("cover").files[0])
	        formdata.append("cover", document.getElementById("cover").files[0]);
	        formdata.append("title",`${document.getElementById("ftitle").value}`);
	        formdata.append("en_title",`${document.getElementById("title").value}`);
	        formdata.append("telegram",`${document.getElementById("telegram").checked}`);
	        formdata.append("comment",`${document.getElementById("comments").checked}`);
	        formdata.append("tags",`${document.getElementById("tags").value}`);
	        formdata.append("feditor",`${this.get().feditor.getData()}`);
	        formdata.append("eneditor",`${this.get().eneditor.getData()}`);
	        formdata.append("tags",s);
	        const dr = this.get().defaultRoute;
	        if(dr)
	            formdata.append("route", dr.id);
	        fetch('/page/add',{
	            method: "POST",
	            mode: "same-origin",
	            redirect: "follow",
	            body: formdata
	        }).then(res=>{
	            if(res.status != 200)
	                utils.toast("err");
	            else{
	                utils.toast("Sent");
	                utils.reload();
	            }
	            
	        });
	    },
	    selectRoute(defaultRoute) {
	        this.set({defaultRoute});
	    },

	    loadRoute(currentRoute) {
	        const self = this;
	        const { getPages } = this.get();
	        Promise.resolve(getPages).then(pages => {
	            var items = [];
	            for(var page of pages) {
	                var item = {
	                    id: page.id,
	                    name: page.title
	                };
	                if(page.route_id == currentRoute.id) {
	                    items.push(item);
	                }
	            }
	            for(var it of items) {
	                it.actions = [true,true];
	            }
	            currentRoute.items = items;
	            self.set({currentRoute});
	        }).catch(console.error);
	    },
	    route_item_add(page) {
	        if(page != null){
	            const { currentRoute } = this.get();
	            utils.fetch(`/route/${currentRoute.id}/item/add`, {page: page.id})
	            .then(response => {
	                if (response.status != 200) {
	                    utils.toast("something went wrong !");
	                } else {
	                    utils.toast("Done");
	                    utils.reload();
	                }
	            });
	        } else {
	            utils.toast("page doesn't exist !");
	        }
	    },
	};

	function oncreate$6(){
	    var elems = document.querySelectorAll('.chips');
	    var instances = M.Chips.init(elems,{
	        data:[]
	    });
	    this.set({
	        chips:instances
	    });
	}
	const file$k = "ui\\panel\\admin_pages\\ContentControlCenter.html";

	function create_main_fragment$k(component, ctx) {
		var div5, form, div2, div0, span0, text1, input0, text2, div1, input1, text3, text4, editor0_updating = {}, text5, label0, text7, br0, div3, br1, text8, text9, editor1_updating = {}, text10, label1, text12, div4, input4, text13, label2, input5, text14, span1, text16, label3, input6, text17, span2, text19, promise, text20, text21, br2, div6, br3, text22, div7, promise_1, current;

		var input2_initial_data = {
		 	col: "s12",
		 	label: "Persian Page title",
		 	id: "ftitle",
		 	type: "text"
		 };
		var input2 = new Input({
			root: component.root,
			store: component.store,
			data: input2_initial_data
		});

		var editor0_initial_data = { id: "content", initial: "Persian Editor" };
		if (ctx.feditor !== void 0) {
			editor0_initial_data.editor = ctx.feditor;
			editor0_updating.editor = true;
		}
		var editor0 = new Editor({
			root: component.root,
			store: component.store,
			data: editor0_initial_data,
			_bind(changed, childState) {
				var newState = {};
				if (!editor0_updating.editor && changed.editor) {
					newState.feditor = childState.editor;
				}
				component._set(newState);
				editor0_updating = {};
			}
		});

		component.root._beforecreate.push(() => {
			editor0._bind({ editor: 1 }, editor0.get());
		});

		var input3_initial_data = {
		 	col: "s12",
		 	label: "English Page title",
		 	id: "title",
		 	type: "text"
		 };
		var input3 = new Input({
			root: component.root,
			store: component.store,
			data: input3_initial_data
		});

		var editor1_initial_data = {
		 	id: "en_content",
		 	initial: "English Editor"
		 };
		if (ctx.eneditor !== void 0) {
			editor1_initial_data.editor = ctx.eneditor;
			editor1_updating.editor = true;
		}
		var editor1 = new Editor({
			root: component.root,
			store: component.store,
			data: editor1_initial_data,
			_bind(changed, childState) {
				var newState = {};
				if (!editor1_updating.editor && changed.editor) {
					newState.eneditor = childState.editor;
				}
				component._set(newState);
				editor1_updating = {};
			}
		});

		component.root._beforecreate.push(() => {
			editor1._bind({ editor: 1 }, editor1.get());
		});

		let info = {
			component,
			ctx,
			current: null,
			pending: create_pending_block_2,
			then: create_then_block_2,
			catch: create_catch_block_2,
			value: 'routes',
			error: 'null',
			blocks: Array(3)
		};

		handlePromise(promise = ctx.getRoutes, info);

		function select_block_type(ctx) {
			if (ctx.update) return create_if_block_1$6;
			return create_else_block$6;
		}

		var current_block_type = select_block_type(ctx);
		var if_block = current_block_type(component, ctx);

		let info_1 = {
			component,
			ctx,
			current: null,
			pending: create_pending_block$3,
			then: create_then_block$3,
			catch: create_catch_block_1,
			value: 'routes',
			error: 'null',
			blocks: Array(3)
		};

		handlePromise(promise_1 = ctx.getRoutes, info_1);

		return {
			c: function create() {
				div5 = createElement("div");
				form = createElement("form");
				div2 = createElement("div");
				div0 = createElement("div");
				span0 = createElement("span");
				span0.textContent = "Pick";
				text1 = createText("\r\n                    ");
				input0 = createElement("input");
				text2 = createText("\r\n                ");
				div1 = createElement("div");
				input1 = createElement("input");
				text3 = createText("\r\n            ");
				input2._fragment.c();
				text4 = createText("\r\n            ");
				editor0._fragment.c();
				text5 = createText("\r\n            ");
				label0 = createElement("label");
				label0.textContent = "Persian description";
				text7 = createText("\r\n            ");
				br0 = createElement("br");
				div3 = createElement("div");
				br1 = createElement("br");
				text8 = createText("\r\n            ");
				input3._fragment.c();
				text9 = createText("\r\n            ");
				editor1._fragment.c();
				text10 = createText("\r\n            ");
				label1 = createElement("label");
				label1.textContent = "English description";
				text12 = createText("\r\n            ");
				div4 = createElement("div");
				input4 = createElement("input");
				text13 = createText("\r\n            ");
				label2 = createElement("label");
				input5 = createElement("input");
				text14 = createText("\r\n                ");
				span1 = createElement("span");
				span1.textContent = "Send to telegram";
				text16 = createText("\r\n            ");
				label3 = createElement("label");
				input6 = createElement("input");
				text17 = createText("\r\n                ");
				span2 = createElement("span");
				span2.textContent = "Enable comments";
				text19 = createText("\r\n            ");

				info.block.c();

				text20 = createText("\r\n        ");
				if_block.c();
				text21 = createText("\r\n");
				br2 = createElement("br");
				div6 = createElement("div");
				br3 = createElement("br");
				text22 = createText("\r\n");
				div7 = createElement("div");

				info_1.block.c();
				addLoc(span0, file$k, 5, 20, 207);
				input0.id = "cover";
				setAttribute(input0, "type", "file");
				addLoc(input0, file$k, 6, 20, 246);
				div0.className = "btn waves-effect waves-light black-text grey lighten-2";
				addLoc(div0, file$k, 4, 16, 117);
				input1.disabled = true;
				input1.placeholder = "Pick a cover";
				input1.className = "file-path validate";
				setAttribute(input1, "type", "text");
				addLoc(input1, file$k, 9, 20, 371);
				div1.className = "file-path-wrapper";
				addLoc(div1, file$k, 8, 16, 318);
				div2.className = "file-field input-field";
				addLoc(div2, file$k, 3, 12, 63);
				label0.htmlFor = "description";
				addLoc(label0, file$k, 14, 12, 684);
				addLoc(br0, file$k, 15, 12, 750);
				div3.className = "divider";
				addLoc(div3, file$k, 15, 16, 754);
				addLoc(br1, file$k, 15, 43, 781);
				label1.htmlFor = "description";
				addLoc(label1, file$k, 18, 12, 975);
				input4.placeholder = "+Tag";
				input4.className = "custom-class";
				input4.id = "tags";
				addLoc(input4, file$k, 20, 20, 1082);
				div4.className = "chips";
				addLoc(div4, file$k, 19, 12, 1041);
				setAttribute(input5, "type", "checkbox");
				input5.id = "telegram";
				addLoc(input5, file$k, 23, 16, 1202);
				addLoc(span1, file$k, 24, 16, 1259);
				addLoc(label2, file$k, 22, 12, 1177);
				setAttribute(input6, "type", "checkbox");
				input6.id = "comments";
				addLoc(input6, file$k, 27, 16, 1349);
				addLoc(span2, file$k, 28, 16, 1405);
				addLoc(label3, file$k, 26, 12, 1324);
				form.id = "post";
				addLoc(form, file$k, 2, 9, 33);
				div5.className = "row";
				addLoc(div5, file$k, 0, 0, 0);
				addLoc(br2, file$k, 43, 0, 1996);
				div6.className = "divider";
				addLoc(div6, file$k, 43, 4, 2000);
				addLoc(br3, file$k, 43, 32, 2028);
				div7.className = "row";
				addLoc(div7, file$k, 44, 0, 2034);
			},

			m: function mount(target, anchor) {
				insert(target, div5, anchor);
				append(div5, form);
				append(form, div2);
				append(div2, div0);
				append(div0, span0);
				append(div0, text1);
				append(div0, input0);
				append(div2, text2);
				append(div2, div1);
				append(div1, input1);
				append(form, text3);
				input2._mount(form, null);
				append(form, text4);
				editor0._mount(form, null);
				append(form, text5);
				append(form, label0);
				append(form, text7);
				append(form, br0);
				append(form, div3);
				append(form, br1);
				append(form, text8);
				input3._mount(form, null);
				append(form, text9);
				editor1._mount(form, null);
				append(form, text10);
				append(form, label1);
				append(form, text12);
				append(form, div4);
				append(div4, input4);
				append(form, text13);
				append(form, label2);
				append(label2, input5);
				append(label2, text14);
				append(label2, span1);
				append(form, text16);
				append(form, label3);
				append(label3, input6);
				append(label3, text17);
				append(label3, span2);
				append(form, text19);

				info.block.i(form, info.anchor = null);
				info.mount = () => form;
				info.anchor = null;

				append(div5, text20);
				if_block.m(div5, null);
				insert(target, text21, anchor);
				insert(target, br2, anchor);
				insert(target, div6, anchor);
				insert(target, br3, anchor);
				insert(target, text22, anchor);
				insert(target, div7, anchor);

				info_1.block.i(div7, info_1.anchor = null);
				info_1.mount = () => div7;
				info_1.anchor = null;

				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				var editor0_changes = {};
				if (!editor0_updating.editor && changed.feditor) {
					editor0_changes.editor = ctx.feditor;
					editor0_updating.editor = ctx.feditor !== void 0;
				}
				editor0._set(editor0_changes);
				editor0_updating = {};

				var editor1_changes = {};
				if (!editor1_updating.editor && changed.eneditor) {
					editor1_changes.editor = ctx.eneditor;
					editor1_updating.editor = ctx.eneditor !== void 0;
				}
				editor1._set(editor1_changes);
				editor1_updating = {};

				info.ctx = ctx;

				if (('getRoutes' in changed) && promise !== (promise = ctx.getRoutes) && handlePromise(promise, info)) ; else {
					info.block.p(changed, assign(assign({}, ctx), info.resolved));
				}

				if (current_block_type !== (current_block_type = select_block_type(ctx))) {
					if_block.d(1);
					if_block = current_block_type(component, ctx);
					if_block.c();
					if_block.m(div5, null);
				}

				info_1.ctx = ctx;

				if (('getRoutes' in changed) && promise_1 !== (promise_1 = ctx.getRoutes) && handlePromise(promise_1, info_1)) ; else {
					info_1.block.p(changed, assign(assign({}, ctx), info_1.resolved));
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 6);

				if (input2) input2._fragment.o(outrocallback);
				if (editor0) editor0._fragment.o(outrocallback);
				if (input3) input3._fragment.o(outrocallback);
				if (editor1) editor1._fragment.o(outrocallback);

				const countdown = callAfter(outrocallback, 3);
				for (let i = 0; i < 3; i += 1) {
					const block = info.blocks[i];
					if (block) block.o(countdown);
					else countdown();
				}

				const countdown_1 = callAfter(outrocallback, 3);
				for (let i = 0; i < 3; i += 1) {
					const block = info_1.blocks[i];
					if (block) block.o(countdown_1);
					else countdown_1();
				}

				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div5);
				}

				input2.destroy();
				editor0.destroy();
				input3.destroy();
				editor1.destroy();

				info.block.d();
				info = null;

				if_block.d();
				if (detach) {
					detachNode(text21);
					detachNode(br2);
					detachNode(div6);
					detachNode(br3);
					detachNode(text22);
					detachNode(div7);
				}

				info_1.block.d();
				info_1 = null;
			}
		};
	}

	// (1:0) <div class="row">                <form id="post">              <div class="file-field input-field">                  <div class="btn waves-effect waves-light black-text grey lighten-2">                      <span>Pick</span>                      <input id="cover" type="file">                  </div>                  <div class="file-path-wrapper">                      <input disabled placeholder="Pick a cover" class="file-path validate" type="text">                  </div>              </div>              <Input col="s12" label="Persian Page title" id="ftitle" type="text" />              <Editor id="content" initial="Persian Editor" bind:editor=feditor></Editor>              <label for="description">Persian description</label>              <br><div class="divider"></div><br>              <Input col="s12" label="English Page title" id="title" type="text" />              <Editor id="en_content" initial="English Editor" bind:editor=eneditor></Editor>              <label for="description">English description</label>              <div class="chips">                      <input placeholder="+Tag" class="custom-class" id="tags">                  </div>              <label>                  <input type="checkbox" id="telegram" />                  <span>Send to telegram</span>              </label>              <label>                  <input type="checkbox" id="comments"/>                  <span>Enable comments</span>              </label>              {#await getRoutes}
	function create_catch_block_2(component, ctx) {

		return {
			c: noop,

			m: noop,

			p: noop,

			i: noop,

			o: run,

			d: noop
		};
	}

	// (33:12) {:then routes}
	function create_then_block_2(component, ctx) {
		var h5, text_1, current;

		var select_initial_data = {
		 	id: "droutes",
		 	label: "routes",
		 	text: "select a route",
		 	options: ctx.routes
		 };
		var select = new Select({
			root: component.root,
			store: component.store,
			data: select_initial_data
		});

		select.on("select", function(event) {
			component.selectRoute(event);
		});

		return {
			c: function create() {
				h5 = createElement("h5");
				h5.textContent = "add to";
				text_1 = createText("\r\n                ");
				select._fragment.c();
				addLoc(h5, file$k, 33, 16, 1567);
			},

			m: function mount(target, anchor) {
				insert(target, h5, anchor);
				insert(target, text_1, anchor);
				select._mount(target, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				var select_changes = {};
				if (changed.getRoutes) select_changes.options = ctx.routes;
				select._set(select_changes);
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				if (select) select._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(h5);
					detachNode(text_1);
				}

				select.destroy(detach);
			}
		};
	}

	// (31:30)                   <Loading small/>              {:then routes}
	function create_pending_block_2(component, ctx) {
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

	// (40:8) {:else}
	function create_else_block$6(component, ctx) {
		var br, a;

		function click_handler(event) {
			component.post();
		}

		return {
			c: function create() {
				br = createElement("br");
				a = createElement("a");
				a.textContent = "Post";
				addLoc(br, file$k, 40, 8, 1885);
				addListener(a, "click", click_handler);
				a.className = "waves-effect waves-light yellow black-text btn";
				addLoc(a, file$k, 40, 12, 1889);
			},

			m: function mount(target, anchor) {
				insert(target, br, anchor);
				insert(target, a, anchor);
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(br);
					detachNode(a);
				}

				removeListener(a, "click", click_handler);
			}
		};
	}

	// (38:8) {#if update}
	function create_if_block_1$6(component, ctx) {
		var a;

		function click_handler(event) {
			component.post();
		}

		return {
			c: function create() {
				a = createElement("a");
				a.textContent = "Edit";
				addListener(a, "click", click_handler);
				a.className = "waves-effect waves-light yellow black-text btn";
				addLoc(a, file$k, 38, 8, 1776);
			},

			m: function mount(target, anchor) {
				insert(target, a, anchor);
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(a);
				}

				removeListener(a, "click", click_handler);
			}
		};
	}

	// (1:0) <div class="row">                <form id="post">              <div class="file-field input-field">                  <div class="btn waves-effect waves-light black-text grey lighten-2">                      <span>Pick</span>                      <input id="cover" type="file">                  </div>                  <div class="file-path-wrapper">                      <input disabled placeholder="Pick a cover" class="file-path validate" type="text">                  </div>              </div>              <Input col="s12" label="Persian Page title" id="ftitle" type="text" />              <Editor id="content" initial="Persian Editor" bind:editor=feditor></Editor>              <label for="description">Persian description</label>              <br><div class="divider"></div><br>              <Input col="s12" label="English Page title" id="title" type="text" />              <Editor id="en_content" initial="English Editor" bind:editor=eneditor></Editor>              <label for="description">English description</label>              <div class="chips">                      <input placeholder="+Tag" class="custom-class" id="tags">                  </div>              <label>                  <input type="checkbox" id="telegram" />                  <span>Send to telegram</span>              </label>              <label>                  <input type="checkbox" id="comments"/>                  <span>Enable comments</span>              </label>              {#await getRoutes}
	function create_catch_block_1(component, ctx) {

		return {
			c: noop,

			m: noop,

			p: noop,

			i: noop,

			o: run,

			d: noop
		};
	}

	// (49:8) {:then routes}
	function create_then_block$3(component, ctx) {
		var h5, text1, text2, div, current;

		var select_initial_data = {
		 	id: "routes",
		 	label: "routes",
		 	text: "select a route",
		 	options: ctx.routes
		 };
		var select = new Select({
			root: component.root,
			store: component.store,
			data: select_initial_data
		});

		select.on("select", function(event) {
			component.loadRoute(event);
		});

		var if_block = (ctx.currentRoute) && create_if_block$9(component, ctx);

		return {
			c: function create() {
				h5 = createElement("h5");
				h5.textContent = "Routes";
				text1 = createText("\r\n            ");
				select._fragment.c();
				text2 = createText("\r\n            ");
				div = createElement("div");
				if (if_block) if_block.c();
				addLoc(h5, file$k, 49, 12, 2153);
				addLoc(div, file$k, 51, 12, 2298);
			},

			m: function mount(target, anchor) {
				insert(target, h5, anchor);
				insert(target, text1, anchor);
				select._mount(target, anchor);
				insert(target, text2, anchor);
				insert(target, div, anchor);
				if (if_block) if_block.m(div, null);
				current = true;
			},

			p: function update(changed, ctx) {
				var select_changes = {};
				if (changed.getRoutes) select_changes.options = ctx.routes;
				select._set(select_changes);

				if (ctx.currentRoute) {
					if (if_block) {
						if_block.p(changed, ctx);
					} else {
						if_block = create_if_block$9(component, ctx);
						if (if_block) if_block.c();
					}

					if_block.i(div, null);
				} else if (if_block) {
					if_block.o(function() {
						if_block.d(1);
						if_block = null;
					});
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 2);

				if (select) select._fragment.o(outrocallback);

				if (if_block) if_block.o(outrocallback);
				else outrocallback();

				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(h5);
					detachNode(text1);
				}

				select.destroy(detach);
				if (detach) {
					detachNode(text2);
					detachNode(div);
				}

				if (if_block) if_block.d();
			}
		};
	}

	// (53:12) {#if currentRoute}
	function create_if_block$9(component, ctx) {
		var text0, br, text1, h5, text2, text3_value = ctx.currentRoute.name, text3, text4, await_block_anchor, promise, current;

		var table_initial_data = {
		 	highlight: true,
		 	rows: 5,
		 	actions: [
	                    {icon: "delete", tooltip: "delete", action(page, table) {
	                        ctx.utils.fetch(`/page/${page.id}/route/remove`, {})
	                        .then(r=>{
	                            if(r.status == 200) {
	                                ctx.utils.toast("Done");
	                                ctx.utils.reload();
	                            }
	                            else ctx.utils.toast("something went wrong !");
	                        })
	                        .catch(err => ctx.utils.toast("something went wrong !"));
	                    }},{icon: "edit" , tooltip:"edit",action(page,table){
	                        ctx.kos(page);
	                    }}],
		 	content: ctx.currentRoute.items,
		 	search: ["name"]
		 };
		var table = new Table({
			root: component.root,
			store: component.store,
			data: table_initial_data
		});

		let info = {
			component,
			ctx,
			current: null,
			pending: create_pending_block_1,
			then: create_then_block_1,
			catch: create_catch_block$3,
			value: 'pages',
			error: 'null',
			blocks: Array(3)
		};

		handlePromise(promise = ctx.getPages.then(pages => {
	                    var items = [];
	                    for(var page of pages) {
	                        items.push({
	                            id: page.id,
	                            name: page.title
	                        });
	                    }
	                    return items;
	                }), info);

		return {
			c: function create() {
				table._fragment.c();
				text0 = createText("\r\n                ");
				br = createElement("br");
				text1 = createText("\r\n                ");
				h5 = createElement("h5");
				text2 = createText("Add an item to ");
				text3 = createText(text3_value);
				text4 = createText("\r\n                ");
				await_block_anchor = createComment();

				info.block.c();
				addLoc(br, file$k, 68, 16, 3171);
				addLoc(h5, file$k, 69, 16, 3193);
			},

			m: function mount(target, anchor) {
				table._mount(target, anchor);
				insert(target, text0, anchor);
				insert(target, br, anchor);
				insert(target, text1, anchor);
				insert(target, h5, anchor);
				append(h5, text2);
				append(h5, text3);
				insert(target, text4, anchor);
				insert(target, await_block_anchor, anchor);

				info.block.i(target, info.anchor = anchor);
				info.mount = () => await_block_anchor.parentNode;
				info.anchor = await_block_anchor;

				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				var table_changes = {};
				if (changed.utils || changed.kos) table_changes.actions = [
	                    {icon: "delete", tooltip: "delete", action(page, table) {
	                        ctx.utils.fetch(`/page/${page.id}/route/remove`, {})
	                        .then(r=>{
	                            if(r.status == 200) {
	                                ctx.utils.toast("Done");
	                                ctx.utils.reload();
	                            }
	                            else ctx.utils.toast("something went wrong !");
	                        })
	                        .catch(err => ctx.utils.toast("something went wrong !"));
	                    }},{icon: "edit" , tooltip:"edit",action(page,table){
	                        ctx.kos(page);
	                    }}];
				if (changed.currentRoute) table_changes.content = ctx.currentRoute.items;
				table._set(table_changes);

				if ((!current || changed.currentRoute) && text3_value !== (text3_value = ctx.currentRoute.name)) {
					setData(text3, text3_value);
				}

				info.ctx = ctx;

				if (('getPages' in changed) && promise !== (promise = ctx.getPages.then(pages => {
	                    var items = [];
	                    for(var page of pages) {
	                        items.push({
	                            id: page.id,
	                            name: page.title
	                        });
	                    }
	                    return items;
	                })) && handlePromise(promise, info)) ; else {
					info.block.p(changed, assign(assign({}, ctx), info.resolved));
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 2);

				if (table) table._fragment.o(outrocallback);

				const countdown = callAfter(outrocallback, 3);
				for (let i = 0; i < 3; i += 1) {
					const block = info.blocks[i];
					if (block) block.o(countdown);
					else countdown();
				}

				current = false;
			},

			d: function destroy$$1(detach) {
				table.destroy(detach);
				if (detach) {
					detachNode(text0);
					detachNode(br);
					detachNode(text1);
					detachNode(h5);
					detachNode(text4);
					detachNode(await_block_anchor);
				}

				info.block.d(detach);
				info = null;
			}
		};
	}

	// (1:0) <div class="row">                <form id="post">              <div class="file-field input-field">                  <div class="btn waves-effect waves-light black-text grey lighten-2">                      <span>Pick</span>                      <input id="cover" type="file">                  </div>                  <div class="file-path-wrapper">                      <input disabled placeholder="Pick a cover" class="file-path validate" type="text">                  </div>              </div>              <Input col="s12" label="Persian Page title" id="ftitle" type="text" />              <Editor id="content" initial="Persian Editor" bind:editor=feditor></Editor>              <label for="description">Persian description</label>              <br><div class="divider"></div><br>              <Input col="s12" label="English Page title" id="title" type="text" />              <Editor id="en_content" initial="English Editor" bind:editor=eneditor></Editor>              <label for="description">English description</label>              <div class="chips">                      <input placeholder="+Tag" class="custom-class" id="tags">                  </div>              <label>                  <input type="checkbox" id="telegram" />                  <span>Send to telegram</span>              </label>              <label>                  <input type="checkbox" id="comments"/>                  <span>Enable comments</span>              </label>              {#await getRoutes}
	function create_catch_block$3(component, ctx) {

		return {
			c: noop,

			m: noop,

			p: noop,

			i: noop,

			o: run,

			d: noop
		};
	}

	// (82:16) {:then pages}
	function create_then_block_1(component, ctx) {
		var current;

		var search_initial_data = {
		 	data: ctx.pages,
		 	label: "page",
		 	id: "route-item-page"
		 };
		var search = new Search({
			root: component.root,
			store: component.store,
			data: search_initial_data
		});

		search.on("result", function(event) {
			component.route_item_add(event);
		});

		return {
			c: function create() {
				search._fragment.c();
			},

			m: function mount(target, anchor) {
				search._mount(target, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				var search_changes = {};
				if (changed.getPages) search_changes.data = ctx.pages;
				search._set(search_changes);
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				if (search) search._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				search.destroy(detach);
			}
		};
	}

	// (80:19)                       <Loading small/>                  {:then pages}
	function create_pending_block_1(component, ctx) {
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

	// (47:26)               <Loading small/>          {:then routes}
	function create_pending_block$3(component, ctx) {
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

	function ContentControlCenter(options) {
		this._debugName = '<ContentControlCenter>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data$f(), options.data);
		if (!('feditor' in this._state)) console.warn("<ContentControlCenter> was created without expected data property 'feditor'");
		if (!('eneditor' in this._state)) console.warn("<ContentControlCenter> was created without expected data property 'eneditor'");
		if (!('getRoutes' in this._state)) console.warn("<ContentControlCenter> was created without expected data property 'getRoutes'");
		if (!('update' in this._state)) console.warn("<ContentControlCenter> was created without expected data property 'update'");
		if (!('currentRoute' in this._state)) console.warn("<ContentControlCenter> was created without expected data property 'currentRoute'");
		if (!('utils' in this._state)) console.warn("<ContentControlCenter> was created without expected data property 'utils'");
		if (!('kos' in this._state)) console.warn("<ContentControlCenter> was created without expected data property 'kos'");
		if (!('getPages' in this._state)) console.warn("<ContentControlCenter> was created without expected data property 'getPages'");
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$k(this, this._state);

		this.root._oncreate.push(() => {
			oncreate$6.call(this);
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

	assign(ContentControlCenter.prototype, protoDev);
	assign(ContentControlCenter.prototype, methods$a);

	ContentControlCenter.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\panel\admin_pages\ConsultationSchedule.html generated by Svelte v2.16.1 */

	function data$g(){
	    return {
	        objModal: null,
	        ft_id: null,
	        crudindex: 0, // 1 : edit , 0 : create , 2 : delete
	        getfreetimes: utils.fetch("/free-time/all")
	        .then(response => {
	                var fts = response.body;
	                var rows = [];
	                for(var ft of fts) {
	                        // [ DELETE , EDIT , BLOCK , UNBLOCK ]
	                        ft.actions = [
	                            [7].includes(cdsuser.access),  // only dev can delete a data
	                            [3, 5, 7].includes(cdsuser.access), // dev , admin and mod can edit the apply
	                            [5, 7].includes(cdsuser.access) && ft.status == 1, // available and not reserved
	                        ];
	                        
	                        rows.push(ft);
	                }
	                return rows;
	            })
	            .catch(err => utils.toast("something went wrong !")),
	    }
	}
	var methods$b = {
	    fireMe(index){
	        if(index === 0){
	            this.set({crudindex: index});
	            var elems = document.querySelector('.modal');
	            var instances = M.Modal.init(elems, {});
	            instances.open();
	            var delems = document.querySelectorAll('.datepicker');
	            var dinstances = M.Datepicker.init(delems);
	            var telems = document.querySelectorAll('.timepicker');
	            var tinstances = M.Timepicker.init(telems);
	        }
	    },
	    open({obj, index}){
	            this.set({crudindex: index, objModal: obj, ft_id: obj.id});
	            var elems = document.querySelector('.modal');
	            var instances = M.Modal.init(elems, {});
	            instances.open();
	            var delems = document.querySelectorAll('.datepicker');
	            var dinstances = M.Datepicker.init(delems);
	            var telems = document.querySelectorAll('.timepicker');
	            var tinstances = M.Timepicker.init(telems);
	    },
	    action(){
	        
	        const {crudindex} = this.get();
	        const {ft_id} = this.get();
	        
	        // get down the road with crudindex!!!
	        if(crudindex === 1){

	            const eldate = document.getElementById("date");
	            const eltime = document.getElementById("time");
	            const elprice = document.getElementById("price");

	            const date = eldate.value ? eldate.value : null;
	            const time = eltime.value ? eltime.value : null;
	            const price = elprice.value ? elprice.value : null;
	            
	            utils.fetch("/free-time/edit", {date, time, price, ft_id}).then((res)=>{
	                if(res.status!=200){
	                    utils.toast("something went wrong !");
	                } else{
	                    utils.toast("Done");
	                    utils.reload();
	                }
	           }).catch(err => utils.toast("something went wrong !"));
	        } else if(crudindex === 0){
	            
	            const eldate = document.getElementById("date");
	            const eltime = document.getElementById("time");
	            const elprice = document.getElementById("price");

	            const date = eldate.value ? eldate.value : null;
	            const time = eltime.value ? eltime.value : null;
	            const price = elprice.value ? elprice.value : null;
	           
	            if(!date || !time || !price){
	                utils.toast("fill all the fields !");
	                utils.reload();
	            }

	            utils.fetch("/free-time/add", {date, time, price}).then((res)=>{
	                if(res.status!=200){
	                    utils.toast("something went wrong !");
	                } else{
	                    utils.toast("Done");
	                    utils.reload();
	                }
	           }).catch(err => utils.toast("something went wrong !"));
	        }  else{
	            utils.fetch(`/free-time/delete/${ft_id}`, {}).then((res)=>{
	                if(res.status!=200){
	                    utils.toast("something went wrong !");
	                } else{
	                    utils.toast("Done");
	                    utils.reload();
	                }
	           }).catch(err => utils.toast("something went wrong !"));
	        }
	        
	    }
	};

	const file$l = "ui\\panel\\admin_pages\\ConsultationSchedule.html";

	function create_main_fragment$l(component, ctx) {
		var div, promise, current;

		let info = {
			component,
			ctx,
			current: null,
			pending: create_pending_block$4,
			then: create_then_block$4,
			catch: create_catch_block$4,
			value: 'freetimes',
			error: 'err',
			blocks: Array(3)
		};

		handlePromise(promise = ctx.getfreetimes, info);

		return {
			c: function create() {
				div = createElement("div");

				info.block.c();
				div.className = "row";
				addLoc(div, file$l, 4, 0, 46);
			},

			m: function mount(target, anchor) {
				insert(target, div, anchor);

				info.block.i(div, info.anchor = null);
				info.mount = () => div;
				info.anchor = null;

				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				info.ctx = ctx;

				if (('getfreetimes' in changed) && promise !== (promise = ctx.getfreetimes) && handlePromise(promise, info)) ; else {
					info.block.p(changed, assign(assign({}, ctx), info.resolved));
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				const countdown = callAfter(outrocallback, 3);
				for (let i = 0; i < 3; i += 1) {
					const block = info.blocks[i];
					if (block) block.o(countdown);
					else countdown();
				}

				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div);
				}

				info.block.d();
				info = null;
			}
		};
	}

	// (83:4) {:catch err}
	function create_catch_block$4(component, ctx) {
		var p, text0, text1_value = ctx.err.message, text1, current;

		return {
			c: function create() {
				p = createElement("p");
				text0 = createText("Error ");
				text1 = createText(text1_value);
				addLoc(p, file$l, 83, 8, 4952);
			},

			m: function mount(target, anchor) {
				insert(target, p, anchor);
				append(p, text0);
				append(p, text1);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.getfreetimes) && text1_value !== (text1_value = ctx.err.message)) {
					setData(text1, text1_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(p);
				}
			}
		};
	}

	// (8:4) {:then freetimes}
	function create_then_block$4(component, ctx) {
		var div2, div0, h4, text0_value = ctx.crudindex===1 ? "Edit" : ctx.crudindex===0 ? "Create" : "", text0, text1, current_block_type_index, if_block, text2, div1, button, text3_value = ctx.crudindex===1 ? "Update" : ctx.crudindex===0 ? "Add" : ctx.crudindex===2 ? "Delete" : ctx.crudindex===4? "Block" : "Unblock", text3, div2_id_value, text4, text5, div3, a, text6, current;

		var if_block_creators = [
			create_if_block$a,
			create_if_block_1$7,
			create_else_block$7
		];

		var if_blocks = [];

		function select_block_type(ctx) {
			if (ctx.crudindex === 2) return 0;
			if (ctx.crudindex === 1) return 1;
			return 2;
		}

		current_block_type_index = select_block_type(ctx);
		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](component, ctx);

		function click_handler(event) {
			component.action();
		}

		var table_initial_data = {
		 	highlight: true,
		 	rows: 3,
		 	content: ctx.freetimes,
		 	search: ["id", "date", "time", "price"],
		 	actions: [
	                                                /* ------------------------------------------------
	                                                    list of all actions for free time data table 
	                                                --------------------------------------------------
	                                                */
	                        // ==============================================================================================
	                        // DELETE
	                        // ==============================================================================================
	                        {icon: "delete",tooltip: "delete", action(obj, component) {
	                                var index = 2;
	                                component.fire("modal", {obj, index}); 
	                                
	                            }
	                        }, 
	                        // ==============================================================================================
	                        // EDIT : for dev , admin and mod
	                        // ==============================================================================================
	                        {icon: "edit",tooltip: "edit", action(obj, component) {
	                                var index = 1;
	                                component.fire("modal", {obj, index});    
	                            }
	                        }, 
	                        // ==============================================================================================
	                        // RESERVED : 
	                        // status 0 means reserved and is not available
	                        // status 1 means not reserved and is available
	                        // when the status is 1 icon is off
	                        // when the status is 0 icon is on
	                        // ==============================================================================================
	                        {icon: "alarm_on",tooltip: "not reserved", action(obj, component) {}}
	                    ]
		 };
		var table = new Table({
			root: component.root,
			store: component.store,
			data: table_initial_data
		});

		table.on("modal", function(event) {
			component.open(event);
		});

		var i = new Icon({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() }
		});

		function click_handler_1(event) {
			component.fireMe(0);
		}

		return {
			c: function create() {
				div2 = createElement("div");
				div0 = createElement("div");
				h4 = createElement("h4");
				text0 = createText(text0_value);
				text1 = createText("\r\n                        \r\n                        ");
				if_block.c();
				text2 = createText("\r\n                ");
				div1 = createElement("div");
				button = createElement("button");
				text3 = createText(text3_value);
				text4 = createText(" \r\n\r\n       ");
				table._fragment.c();
				text5 = createText("\r\n\r\n        ");
				div3 = createElement("div");
				a = createElement("a");
				text6 = createText("add");
				i._fragment.c();
				addLoc(h4, file$l, 12, 20, 481);
				div0.className = "modal-content";
				addLoc(div0, file$l, 11, 16, 432);
				addListener(button, "click", click_handler);
				button.className = "modal-close waves-effect waves-green btn-flat";
				addLoc(button, file$l, 36, 20, 2074);
				div1.className = "modal-footer";
				addLoc(div1, file$l, 35, 16, 2026);
				div2.id = div2_id_value = ctx.crudindex===1 ? "modaledit" :  ctx.crudindex===0 ? "modalcreate" : ctx.crudindex===4 ? "modalblock" : ctx.crudindex===5 ? "modalunblock" : "modaldelete";
				div2.className = "modal bottom-sheet";
				addLoc(div2, file$l, 10, 12, 234);
				addListener(a, "click", click_handler_1);
				a.className = "btn-floating btn-large waves-effect waves-light red";
				addLoc(a, file$l, 78, 14, 4806);
				div3.className = "fixed-action-btn";
				addLoc(div3, file$l, 77, 8, 4760);
			},

			m: function mount(target, anchor) {
				insert(target, div2, anchor);
				append(div2, div0);
				append(div0, h4);
				append(h4, text0);
				append(div0, text1);
				if_blocks[current_block_type_index].m(div0, null);
				append(div2, text2);
				append(div2, div1);
				append(div1, button);
				append(button, text3);
				insert(target, text4, anchor);
				table._mount(target, anchor);
				insert(target, text5, anchor);
				insert(target, div3, anchor);
				append(div3, a);
				append(i._slotted.default, text6);
				i._mount(a, null);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((!current || changed.crudindex) && text0_value !== (text0_value = ctx.crudindex===1 ? "Edit" : ctx.crudindex===0 ? "Create" : "")) {
					setData(text0, text0_value);
				}

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
					if_block.m(div0, null);
				}

				if ((!current || changed.crudindex) && text3_value !== (text3_value = ctx.crudindex===1 ? "Update" : ctx.crudindex===0 ? "Add" : ctx.crudindex===2 ? "Delete" : ctx.crudindex===4? "Block" : "Unblock")) {
					setData(text3, text3_value);
				}

				if ((!current || changed.crudindex) && div2_id_value !== (div2_id_value = ctx.crudindex===1 ? "modaledit" :  ctx.crudindex===0 ? "modalcreate" : ctx.crudindex===4 ? "modalblock" : ctx.crudindex===5 ? "modalunblock" : "modaldelete")) {
					div2.id = div2_id_value;
				}

				var table_changes = {};
				if (changed.getfreetimes) table_changes.content = ctx.freetimes;
				table._set(table_changes);
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 3);

				if (if_block) if_block.o(outrocallback);
				else outrocallback();

				if (table) table._fragment.o(outrocallback);
				if (i) i._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div2);
				}

				if_blocks[current_block_type_index].d();
				removeListener(button, "click", click_handler);
				if (detach) {
					detachNode(text4);
				}

				table.destroy(detach);
				if (detach) {
					detachNode(text5);
					detachNode(div3);
				}

				i.destroy();
				removeListener(a, "click", click_handler_1);
			}
		};
	}

	// (29:24) {:else}
	function create_else_block$7(component, ctx) {
		var text0, text1, current;

		var input0_initial_data = {
		 	col: "s12",
		 	label: "date",
		 	class: "datepicker",
		 	id: "date",
		 	type: "text"
		 };
		var input0 = new Input({
			root: component.root,
			store: component.store,
			data: input0_initial_data
		});

		var input1_initial_data = {
		 	col: "s12",
		 	label: "time",
		 	class: "timepicker",
		 	id: "time",
		 	type: "text"
		 };
		var input1 = new Input({
			root: component.root,
			store: component.store,
			data: input1_initial_data
		});

		var input2_initial_data = {
		 	col: "s12",
		 	label: "price",
		 	id: "price",
		 	type: "number"
		 };
		var input2 = new Input({
			root: component.root,
			store: component.store,
			data: input2_initial_data
		});

		return {
			c: function create() {
				input0._fragment.c();
				text0 = createText("\r\n                            ");
				input1._fragment.c();
				text1 = createText("\r\n                            ");
				input2._fragment.c();
			},

			m: function mount(target, anchor) {
				input0._mount(target, anchor);
				insert(target, text0, anchor);
				input1._mount(target, anchor);
				insert(target, text1, anchor);
				input2._mount(target, anchor);
				current = true;
			},

			p: noop,

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 3);

				if (input0) input0._fragment.o(outrocallback);
				if (input1) input1._fragment.o(outrocallback);
				if (input2) input2._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				input0.destroy(detach);
				if (detach) {
					detachNode(text0);
				}

				input1.destroy(detach);
				if (detach) {
					detachNode(text1);
				}

				input2.destroy(detach);
			}
		};
	}

	// (19:49) 
	function create_if_block_1$7(component, ctx) {
		var div, if_block_anchor, current;

		var if_block = (ctx.objModal) && create_if_block_2$3(component, ctx);

		var card_initial_data = { col: "s12 m10 offset-m1 l10 offset-l1" };
		var card = new Card({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: card_initial_data
		});

		return {
			c: function create() {
				div = createElement("div");
				if (if_block) if_block.c();
				if_block_anchor = createComment();
				card._fragment.c();
				div.className = "row";
				addLoc(div, file$l, 19, 28, 876);
			},

			m: function mount(target, anchor) {
				insert(target, div, anchor);
				if (if_block) if_block.m(card._slotted.default, null);
				append(card._slotted.default, if_block_anchor);
				card._mount(div, null);
				current = true;
			},

			p: function update(changed, ctx) {
				if (ctx.objModal) {
					if (if_block) {
						if_block.p(changed, ctx);
					} else {
						if_block = create_if_block_2$3(component, ctx);
						if (if_block) if_block.c();
					}

					if_block.i(if_block_anchor.parentNode, if_block_anchor);
				} else if (if_block) {
					if_block.o(function() {
						if_block.d(1);
						if_block = null;
					});
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 2);

				if (if_block) if_block.o(outrocallback);
				else outrocallback();

				if (card) card._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div);
				}

				if (if_block) if_block.d();
				card.destroy();
			}
		};
	}

	// (15:24) {#if crudindex === 2}
	function create_if_block$a(component, ctx) {
		var h4, text1, p, text2, strong, text3_value = ctx.objModal.id, text3, text4, current;

		return {
			c: function create() {
				h4 = createElement("h4");
				h4.textContent = "Confirm Delete";
				text1 = createText("\r\n                            ");
				p = createElement("p");
				text2 = createText("Do you really want to delete this free time with id ");
				strong = createElement("strong");
				text3 = createText(text3_value);
				text4 = createText(" ?");
				addLoc(h4, file$l, 15, 28, 649);
				addLoc(strong, file$l, 16, 83, 757);
				addLoc(p, file$l, 16, 28, 702);
			},

			m: function mount(target, anchor) {
				insert(target, h4, anchor);
				insert(target, text1, anchor);
				insert(target, p, anchor);
				append(p, text2);
				append(p, strong);
				append(strong, text3);
				append(p, text4);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.objModal) && text3_value !== (text3_value = ctx.objModal.id)) {
					setData(text3, text3_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(h4);
					detachNode(text1);
					detachNode(p);
				}
			}
		};
	}

	// (22:36) {#if objModal}
	function create_if_block_2$3(component, ctx) {
		var text0, text1, current;

		var input0_initial_data = {
		 	col: "s12",
		 	label: "date",
		 	class: "datepicker",
		 	id: "date",
		 	type: "text",
		 	value: ctx.objModal.date ? ctx.objModal.date : ""
		 };
		var input0 = new Input({
			root: component.root,
			store: component.store,
			data: input0_initial_data
		});

		var input1_initial_data = {
		 	col: "s12",
		 	label: "time",
		 	class: "timepicker",
		 	id: "time",
		 	type: "text",
		 	value: ctx.objModal.time ? ctx.objModal.time : ""
		 };
		var input1 = new Input({
			root: component.root,
			store: component.store,
			data: input1_initial_data
		});

		var input2_initial_data = {
		 	col: "s12",
		 	label: "price",
		 	id: "price",
		 	type: "number",
		 	min: "0",
		 	value: ctx.objModal.price ? ctx.objModal.price : ""
		 };
		var input2 = new Input({
			root: component.root,
			store: component.store,
			data: input2_initial_data
		});

		return {
			c: function create() {
				input0._fragment.c();
				text0 = createText("\r\n                                            ");
				input1._fragment.c();
				text1 = createText("\r\n                                            ");
				input2._fragment.c();
			},

			m: function mount(target, anchor) {
				input0._mount(target, anchor);
				insert(target, text0, anchor);
				input1._mount(target, anchor);
				insert(target, text1, anchor);
				input2._mount(target, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				var input0_changes = {};
				if (changed.objModal) input0_changes.value = ctx.objModal.date ? ctx.objModal.date : "";
				input0._set(input0_changes);

				var input1_changes = {};
				if (changed.objModal) input1_changes.value = ctx.objModal.time ? ctx.objModal.time : "";
				input1._set(input1_changes);

				var input2_changes = {};
				if (changed.objModal) input2_changes.value = ctx.objModal.price ? ctx.objModal.price : "";
				input2._set(input2_changes);
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 3);

				if (input0) input0._fragment.o(outrocallback);
				if (input1) input1._fragment.o(outrocallback);
				if (input2) input2._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				input0.destroy(detach);
				if (detach) {
					detachNode(text0);
				}

				input1.destroy(detach);
				if (detach) {
					detachNode(text1);
				}

				input2.destroy(detach);
			}
		};
	}

	// (6:25)           <Loading small/>      {:then freetimes}
	function create_pending_block$4(component, ctx) {
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

	function ConsultationSchedule(options) {
		this._debugName = '<ConsultationSchedule>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data$g(), options.data);
		if (!('getfreetimes' in this._state)) console.warn("<ConsultationSchedule> was created without expected data property 'getfreetimes'");
		if (!('crudindex' in this._state)) console.warn("<ConsultationSchedule> was created without expected data property 'crudindex'");
		if (!('objModal' in this._state)) console.warn("<ConsultationSchedule> was created without expected data property 'objModal'");
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$l(this, this._state);

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}

		this._intro = true;
	}

	assign(ConsultationSchedule.prototype, protoDev);
	assign(ConsultationSchedule.prototype, methods$b);

	ConsultationSchedule.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\panel\admin_pages\ApplyCenter.html generated by Svelte v2.16.1 */

	function data$h(){
	    var mob = {data: null};
	    return {
	        editor: null,
	        objModal: null,
	        mob,
	        info_id: null,
	        user_id: null,
	        getusers: utils.fetch("/user/all")
	        .then(response =>{
	            var users = [];
	            for(var user of response.body){
	                user.name = user.firstname + " " + user.lastname;
	                if(user.access === 2) users.push(user);
	            }
	            return users
	        }).catch(err => utils.toast("something went wrong !")),
	        crudindex: 0, // 1 : edit , 0 : create , 2 : delete , 4 : block , 5 : unblock
	        getinfos: utils.fetch("/student-control/getAll")
	        .then(response => {
	            var mobs = response.body;
	                mob.data = mobs;
	                var rows = [];
	                for(var mb of mobs) {
	                        var info = {
	                            id : mb.id,
	                            country: mb.country,
	                            university: mb.university,
	                            education_language: mb.education_language,
	                            cv: mb.cv,
	                            sop: mb.sop,
	                            rc: mb.rc,
	                            field: mb.field,
	                            reg_date: mb.reg_date,
	                            status: mb.status
	                        };
	                        // [ DELETE , EDIT , BLOCK , UNBLOCK ]
	                        info.actions = [
	                            [5, 7].includes(cdsuser.access), 
	                            [3, 5, 7].includes(cdsuser.access), // dev , admin and mod can edit the apply
	                            [5, 7].includes(cdsuser.access) && info.status == 1,
	                            [5, 7].includes(cdsuser.access) && info.status == 0,
	                        ];
	                        
	                        rows.push(info);
	                }
	                return rows;
	            })
	            .catch(err => utils.toast("something went wrong !")),
	    }
	}
	var methods$c = {
	    fireMe(index){
	        if(index === 0){
	            this.set({crudindex: index});
	            var elems = document.querySelector('.modal');
	            var instances = M.Modal.init(elems, {});
	            instances.open();    
	        }
	    },
	    loadUser(user) {
	        this.set({user_id: user.id});
	    },
	    open({obj, index}){
	            const mob = this.get().mob.data;
	            for(var mb of mob){
	                if(obj.id === mb.id) {
	                    this.set({crudindex: index, objModal: mb, info_id: obj.id});
	                    this.get().editor.setData(this.get().objModal.description);   
	                }
	            }
	            var elems = document.querySelector('.modal');
	            var instances = M.Modal.init(elems, {});
	            instances.open();
	    },
	    action(){
	        
	        const {crudindex} = this.get();
	        const {info_id} = this.get();
	        // get down the road with crudindex!!!
	        if(crudindex === 1){
	            const elcountry = document.getElementById("country");
	            const eluniversity = document.getElementById("university");
	            const eleducation_language = document.getElementById("education_language");
	            const elcv = document.getElementById("cv");
	            const elsop = document.getElementById("sop");
	            const elrc = document.getElementById("rc");
	            const elfield = document.getElementById("field");
	            const elreg_date = document.getElementById("reg_date");

	            const country = elcountry.value ? elcountry.value : null;
	            const university = eluniversity.value ? eluniversity.value : null;
	            const education_language = eleducation_language.value ? eleducation_language.value : null;
	            const cv = elcv.value ? elcv.value : null;
	            const sop = elsop.value ? elsop.value : null;
	            const rc = elrc.value ? elrc.value : null;
	            const field = elfield.value ? elfield.value : null;
	            const reg_date = elreg_date.value ? elreg_date.value : null;
	            const description = this.get().editor.getData() ? this.get().editor.getData() : null;
	            
	            utils.fetch("/student-control/edit", {info_id, country, university, education_language, cv, sop, rc, field, reg_date, description}).then((res)=>{
	                if(res.status!=200){
	                    utils.toast("something went wrong !");
	                } else{
	                    utils.toast("Done");
	                    utils.reload();
	                }
	           }).catch(err => utils.toast("something went wrong !"));
	        } else if(crudindex === 0){
	            
	            const {user_id} = this.get();
	            
	            if(user_id === null){
	                utils.toast("select a user !");
	                utils.reload();
	            }
	            const elcountry = document.getElementById("country");
	            const eluniversity = document.getElementById("university");
	            const eleducation_language = document.getElementById("education_language");
	            const elcv = document.getElementById("cv");
	            const elsop = document.getElementById("sop");
	            const elrc = document.getElementById("rc");
	            const elfield = document.getElementById("field");
	            const elreg_date = document.getElementById("reg_date");

	            const country = elcountry.value ? elcountry.value : null;
	            const university = eluniversity.value ? eluniversity.value : null;
	            const education_language = eleducation_language.value ? eleducation_language.value : null;
	            const cv = elcv.value ? elcv.value : null;
	            const sop = elsop.value ? elsop.value : null;
	            const rc = elrc.value ? elrc.value : null;
	            const field = elfield.value ? elfield.value : null;
	            const reg_date = elreg_date.value ? elreg_date.value : null;
	            const description = this.get().editor.getData() ? this.get().editor.getData() : null;

	            if(!country || !university || !education_language || !cv || !sop || !rc || !field || !reg_date || !description){
	                utils.toast("fill all the fields !");
	                utils.reload();
	            }

	            utils.fetch("/student-control/add", {country, university, education_language, cv, sop, rc, field, reg_date, description, user_id}).then((res)=>{
	                if(res.status!=200){
	                    utils.toast("something went wrong !");
	                } else{
	                    utils.toast("Done");
	                    utils.reload();
	                }
	           }).catch(err => utils.toast("something went wrong !"));
	        } else if(crudindex === 4){
	            utils.fetch(`/student-control/block/${info_id}`, {}).then((res)=>{
	                if(res.status!=200){
	                    utils.toast("something went wrong !");
	                } else{
	                    utils.toast("Done");
	                    utils.reload();
	                }
	            }).catch(err => utils.toast("something went wrong !"));
	        } else if(crudindex === 5){
	            utils.fetch(`/student-control/unblock/${info_id}`, {}).then((res)=>{
	                if(res.status!=200){
	                    utils.toast("something went wrong !");
	                } else{
	                    utils.toast("Done");
	                    utils.reload();
	                }
	            }).catch(err => utils.toast("something went wrong !"));
	        } else{
	            utils.fetch(`/student-control/delete/${info_id}`, {}).then((res)=>{
	                if(res.status!=200){
	                    utils.toast("something went wrong !");
	                } else{
	                    utils.toast("Done");
	                    utils.reload();
	                }
	           }).catch(err => utils.toast("something went wrong !"));
	        }
	        
	    }
	};

	const file$m = "ui\\panel\\admin_pages\\ApplyCenter.html";

	function create_main_fragment$m(component, ctx) {
		var div, promise, current;

		let info = {
			component,
			ctx,
			current: null,
			pending: create_pending_block$5,
			then: create_then_block$5,
			catch: create_catch_block_1$1,
			value: 'infos',
			error: 'err',
			blocks: Array(3)
		};

		handlePromise(promise = ctx.getinfos, info);

		return {
			c: function create() {
				div = createElement("div");

				info.block.c();
				div.className = "row";
				addLoc(div, file$m, 2, 0, 42);
			},

			m: function mount(target, anchor) {
				insert(target, div, anchor);

				info.block.i(div, info.anchor = null);
				info.mount = () => div;
				info.anchor = null;

				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				info.ctx = ctx;

				if (('getinfos' in changed) && promise !== (promise = ctx.getinfos) && handlePromise(promise, info)) ; else {
					info.block.p(changed, assign(assign({}, ctx), info.resolved));
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				const countdown = callAfter(outrocallback, 3);
				for (let i = 0; i < 3; i += 1) {
					const block = info.blocks[i];
					if (block) block.o(countdown);
					else countdown();
				}

				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div);
				}

				info.block.d();
				info = null;
			}
		};
	}

	// (125:4) {:catch err}
	function create_catch_block_1$1(component, ctx) {
		var p, text0, text1_value = ctx.err.message, text1, current;

		return {
			c: function create() {
				p = createElement("p");
				text0 = createText("Error ");
				text1 = createText(text1_value);
				addLoc(p, file$m, 125, 8, 9006);
			},

			m: function mount(target, anchor) {
				insert(target, p, anchor);
				append(p, text0);
				append(p, text1);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.getinfos) && text1_value !== (text1_value = ctx.err.message)) {
					setData(text1, text1_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(p);
				}
			}
		};
	}

	// (6:4) {:then infos}
	function create_then_block$5(component, ctx) {
		var div2, div0, h4, text0_value = ctx.crudindex===1 ? "Edit" : ctx.crudindex===0 ? "Create" : "", text0, text1, current_block_type_index, if_block, text2, div1, button, text3_value = ctx.crudindex===1 ? "Update" : ctx.crudindex===0 ? "Add" : ctx.crudindex===2 ? "Delete" : ctx.crudindex===4? "Block" : "Unblock", text3, div2_id_value, text4, text5, div3, a, text6, current;

		var if_block_creators = [
			create_if_block$b,
			create_if_block_1$8,
			create_if_block_2$4,
			create_if_block_3$3,
			create_else_block$8
		];

		var if_blocks = [];

		function select_block_type(ctx) {
			if (ctx.crudindex === 2) return 0;
			if (ctx.crudindex === 4) return 1;
			if (ctx.crudindex === 5) return 2;
			if (ctx.crudindex === 1) return 3;
			return 4;
		}

		current_block_type_index = select_block_type(ctx);
		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](component, ctx);

		function click_handler(event) {
			component.action();
		}

		var table_initial_data = {
		 	highlight: true,
		 	rows: 3,
		 	content: ctx.infos,
		 	search: ["user_id", "description", "sop", "cv", "field", "education_language", 
	                     "country", "university", "rc", "reg_date", "cuid", "status", "id"],
		 	actions: [
	                                            /* ------------------------------------------------
	                                                list of all actions for student apply info data table 
	                                            --------------------------------------------------
	                                            */
	                    // ==============================================================================================
	                    // DELETE
	                    // ==============================================================================================
	                    {icon: "delete",tooltip: "delete", action(obj, component) {
	                            var index = 2;
	                           component.fire("modal", {obj, index}); 
	                            
	                        }
	                    }, 
	                    // ==============================================================================================
	                    // EDIT : for dev , admin and mod
	                    // ==============================================================================================
	                    {icon: "edit",tooltip: "edit", action(obj, component) {
	                            var index = 1;
	                            component.fire("modal", {obj, index});    
	                        }
	                    }, 
	                    // ==============================================================================================
	                    // BLOCK STATUS
	                    // ==============================================================================================
	                    {icon: "block",tooltip: "block", action(obj, component) {
	                                var index = 4;
	                                component.fire("modal", {obj, index});
	                        }
	                    },
	                    // ==============================================================================================
	                    // UNBLOCK STATUS
	                    // ==============================================================================================
	                    {icon: "beenhere",tooltip: "unblock", action(obj, component) {
	                                var index = 5;
	                                component.fire("modal", {obj, index});
	                        }
	                    } 
	                ]
		 };
		var table = new Table({
			root: component.root,
			store: component.store,
			data: table_initial_data
		});

		table.on("modal", function(event) {
			component.open(event);
		});

		var i = new Icon({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() }
		});

		function click_handler_1(event) {
			component.fireMe(0);
		}

		return {
			c: function create() {
				div2 = createElement("div");
				div0 = createElement("div");
				h4 = createElement("h4");
				text0 = createText(text0_value);
				text1 = createText("\r\n                        \r\n                        ");
				if_block.c();
				text2 = createText("\r\n                ");
				div1 = createElement("div");
				button = createElement("button");
				text3 = createText(text3_value);
				text4 = createText(" \r\n\r\n        ");
				table._fragment.c();
				text5 = createText("\r\n\r\n        ");
				div3 = createElement("div");
				a = createElement("a");
				text6 = createText("add");
				i._fragment.c();
				addLoc(h4, file$m, 10, 20, 456);
				div0.className = "modal-content";
				addLoc(div0, file$m, 9, 16, 407);
				addListener(button, "click", click_handler);
				button.className = "modal-close waves-effect waves-green btn-flat";
				addLoc(button, file$m, 69, 20, 5697);
				div1.className = "modal-footer";
				addLoc(div1, file$m, 68, 16, 5649);
				div2.id = div2_id_value = ctx.crudindex===1 ? "modaledit" :  ctx.crudindex===0 ? "modalcreate" : ctx.crudindex===4 ? "modalblock" : ctx.crudindex===5 ? "modalunblock" : "modaldelete";
				div2.className = "modal";
				addLoc(div2, file$m, 8, 12, 222);
				addListener(a, "click", click_handler_1);
				a.className = "btn-floating btn-large waves-effect waves-light red";
				addLoc(a, file$m, 120, 14, 8860);
				div3.className = "fixed-action-btn";
				addLoc(div3, file$m, 119, 8, 8814);
			},

			m: function mount(target, anchor) {
				insert(target, div2, anchor);
				append(div2, div0);
				append(div0, h4);
				append(h4, text0);
				append(div0, text1);
				if_blocks[current_block_type_index].m(div0, null);
				append(div2, text2);
				append(div2, div1);
				append(div1, button);
				append(button, text3);
				insert(target, text4, anchor);
				table._mount(target, anchor);
				insert(target, text5, anchor);
				insert(target, div3, anchor);
				append(div3, a);
				append(i._slotted.default, text6);
				i._mount(a, null);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((!current || changed.crudindex) && text0_value !== (text0_value = ctx.crudindex===1 ? "Edit" : ctx.crudindex===0 ? "Create" : "")) {
					setData(text0, text0_value);
				}

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
					if_block.m(div0, null);
				}

				if ((!current || changed.crudindex) && text3_value !== (text3_value = ctx.crudindex===1 ? "Update" : ctx.crudindex===0 ? "Add" : ctx.crudindex===2 ? "Delete" : ctx.crudindex===4? "Block" : "Unblock")) {
					setData(text3, text3_value);
				}

				if ((!current || changed.crudindex) && div2_id_value !== (div2_id_value = ctx.crudindex===1 ? "modaledit" :  ctx.crudindex===0 ? "modalcreate" : ctx.crudindex===4 ? "modalblock" : ctx.crudindex===5 ? "modalunblock" : "modaldelete")) {
					div2.id = div2_id_value;
				}

				var table_changes = {};
				if (changed.getinfos) table_changes.content = ctx.infos;
				table._set(table_changes);
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 3);

				if (if_block) if_block.o(outrocallback);
				else outrocallback();

				if (table) table._fragment.o(outrocallback);
				if (i) i._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div2);
				}

				if_blocks[current_block_type_index].d();
				removeListener(button, "click", click_handler);
				if (detach) {
					detachNode(text4);
				}

				table.destroy(detach);
				if (detach) {
					detachNode(text5);
					detachNode(div3);
				}

				i.destroy();
				removeListener(a, "click", click_handler_1);
			}
		};
	}

	// (49:24) {:else}
	function create_else_block$8(component, ctx) {
		var await_block_anchor, promise, current;

		let info = {
			component,
			ctx,
			current: null,
			pending: create_pending_block_1$1,
			then: create_then_block_1$1,
			catch: create_catch_block$5,
			value: 'users',
			error: 'err',
			blocks: Array(3)
		};

		handlePromise(promise = ctx.getusers, info);

		return {
			c: function create() {
				await_block_anchor = createComment();

				info.block.c();
			},

			m: function mount(target, anchor) {
				insert(target, await_block_anchor, anchor);

				info.block.i(target, info.anchor = anchor);
				info.mount = () => await_block_anchor.parentNode;
				info.anchor = await_block_anchor;

				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				info.ctx = ctx;

				if (('getusers' in changed) && promise !== (promise = ctx.getusers) && handlePromise(promise, info)) ; else {
					info.block.p(changed, assign(assign({}, ctx), info.resolved));
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				const countdown = callAfter(outrocallback, 3);
				for (let i = 0; i < 3; i += 1) {
					const block = info.blocks[i];
					if (block) block.o(countdown);
					else countdown();
				}

				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(await_block_anchor);
				}

				info.block.d(detach);
				info = null;
			}
		};
	}

	// (25:49) 
	function create_if_block_3$3(component, ctx) {
		var div, if_block_anchor, current;

		var if_block = (ctx.objModal) && create_if_block_4$2(component, ctx);

		var card_initial_data = { col: "s12 m10 offset-m1 l10 offset-l1" };
		var card = new Card({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: card_initial_data
		});

		return {
			c: function create() {
				div = createElement("div");
				if (if_block) if_block.c();
				if_block_anchor = createComment();
				card._fragment.c();
				div.className = "row";
				addLoc(div, file$m, 25, 28, 1338);
			},

			m: function mount(target, anchor) {
				insert(target, div, anchor);
				if (if_block) if_block.m(card._slotted.default, null);
				append(card._slotted.default, if_block_anchor);
				card._mount(div, null);
				current = true;
			},

			p: function update(changed, ctx) {
				if (ctx.objModal) {
					if (if_block) {
						if_block.p(changed, ctx);
					} else {
						if_block = create_if_block_4$2(component, ctx);
						if (if_block) if_block.c();
					}

					if_block.i(if_block_anchor.parentNode, if_block_anchor);
				} else if (if_block) {
					if_block.o(function() {
						if_block.d(1);
						if_block = null;
					});
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 2);

				if (if_block) if_block.o(outrocallback);
				else outrocallback();

				if (card) card._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div);
				}

				if (if_block) if_block.d();
				card.destroy();
			}
		};
	}

	// (21:49) 
	function create_if_block_2$4(component, ctx) {
		var h4, text1, p, text2, strong, text3_value = ctx.objModal.firstname, text3, text4, current;

		return {
			c: function create() {
				h4 = createElement("h4");
				h4.textContent = "Confirm Unblock";
				text1 = createText("\r\n                            ");
				p = createElement("p");
				text2 = createText("Do you really want to unblock this info for user ");
				strong = createElement("strong");
				text3 = createText(text3_value);
				text4 = createText(" ?");
				addLoc(h4, file$m, 21, 28, 1082);
				addLoc(strong, file$m, 22, 80, 1188);
				addLoc(p, file$m, 22, 28, 1136);
			},

			m: function mount(target, anchor) {
				insert(target, h4, anchor);
				insert(target, text1, anchor);
				insert(target, p, anchor);
				append(p, text2);
				append(p, strong);
				append(strong, text3);
				append(p, text4);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.objModal) && text3_value !== (text3_value = ctx.objModal.firstname)) {
					setData(text3, text3_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(h4);
					detachNode(text1);
					detachNode(p);
				}
			}
		};
	}

	// (17:49) 
	function create_if_block_1$8(component, ctx) {
		var h4, text1, p, text2, strong, text3_value = ctx.objModal.firstname, text3, text4, current;

		return {
			c: function create() {
				h4 = createElement("h4");
				h4.textContent = "Confirm Block";
				text1 = createText("\r\n                            ");
				p = createElement("p");
				text2 = createText("Do you really want to block this info for user ");
				strong = createElement("strong");
				text3 = createText(text3_value);
				text4 = createText(" ?");
				addLoc(h4, file$m, 17, 28, 854);
				addLoc(strong, file$m, 18, 78, 956);
				addLoc(p, file$m, 18, 28, 906);
			},

			m: function mount(target, anchor) {
				insert(target, h4, anchor);
				insert(target, text1, anchor);
				insert(target, p, anchor);
				append(p, text2);
				append(p, strong);
				append(strong, text3);
				append(p, text4);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.objModal) && text3_value !== (text3_value = ctx.objModal.firstname)) {
					setData(text3, text3_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(h4);
					detachNode(text1);
					detachNode(p);
				}
			}
		};
	}

	// (13:24) {#if crudindex === 2}
	function create_if_block$b(component, ctx) {
		var h4, text1, p, text2, strong, text3_value = ctx.objModal.firstname, text3, text4, current;

		return {
			c: function create() {
				h4 = createElement("h4");
				h4.textContent = "Confirm Delete";
				text1 = createText("\r\n                            ");
				p = createElement("p");
				text2 = createText("Do you really want to delete this info for user ");
				strong = createElement("strong");
				text3 = createText(text3_value);
				text4 = createText(" ?");
				addLoc(h4, file$m, 13, 28, 624);
				addLoc(strong, file$m, 14, 79, 728);
				addLoc(p, file$m, 14, 28, 677);
			},

			m: function mount(target, anchor) {
				insert(target, h4, anchor);
				insert(target, text1, anchor);
				insert(target, p, anchor);
				append(p, text2);
				append(p, strong);
				append(strong, text3);
				append(p, text4);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.objModal) && text3_value !== (text3_value = ctx.objModal.firstname)) {
					setData(text3, text3_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(h4);
					detachNode(text1);
					detachNode(p);
				}
			}
		};
	}

	// (64:28) {:catch err}
	function create_catch_block$5(component, ctx) {
		var p, text0, text1_value = ctx.err.message, text1, current;

		return {
			c: function create() {
				p = createElement("p");
				text0 = createText("Error ");
				text1 = createText(text1_value);
				addLoc(p, file$m, 64, 32, 5512);
			},

			m: function mount(target, anchor) {
				insert(target, p, anchor);
				append(p, text0);
				append(p, text1);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.getusers) && text1_value !== (text1_value = ctx.err.message)) {
					setData(text1, text1_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(p);
				}
			}
		};
	}

	// (52:28) {:then users}
	function create_then_block_1$1(component, ctx) {
		var text0, text1, text2, text3, text4, text5, text6, text7, text8, editor_updating = {}, text9, label, current;

		var select_initial_data = {
		 	id: "users",
		 	label: "users",
		 	text: "select a user",
		 	options: ctx.users
		 };
		var select = new Select({
			root: component.root,
			store: component.store,
			data: select_initial_data
		});

		select.on("select", function(event) {
			component.loadUser(event);
		});

		var input0_initial_data = {
		 	col: "s12",
		 	label: "country",
		 	id: "country",
		 	type: "text"
		 };
		var input0 = new Input({
			root: component.root,
			store: component.store,
			data: input0_initial_data
		});

		var input1_initial_data = {
		 	col: "s12",
		 	label: "university",
		 	id: "university",
		 	type: "text"
		 };
		var input1 = new Input({
			root: component.root,
			store: component.store,
			data: input1_initial_data
		});

		var input2_initial_data = {
		 	col: "s12",
		 	label: "education_language",
		 	id: "education_language",
		 	type: "text"
		 };
		var input2 = new Input({
			root: component.root,
			store: component.store,
			data: input2_initial_data
		});

		var input3_initial_data = {
		 	col: "s12",
		 	label: "cv",
		 	id: "cv",
		 	type: "text"
		 };
		var input3 = new Input({
			root: component.root,
			store: component.store,
			data: input3_initial_data
		});

		var input4_initial_data = {
		 	col: "s12",
		 	label: "sop",
		 	id: "sop",
		 	type: "text"
		 };
		var input4 = new Input({
			root: component.root,
			store: component.store,
			data: input4_initial_data
		});

		var input5_initial_data = {
		 	col: "s12",
		 	label: "rc",
		 	id: "rc",
		 	type: "text"
		 };
		var input5 = new Input({
			root: component.root,
			store: component.store,
			data: input5_initial_data
		});

		var input6_initial_data = {
		 	col: "s12",
		 	label: "field",
		 	id: "field",
		 	type: "text"
		 };
		var input6 = new Input({
			root: component.root,
			store: component.store,
			data: input6_initial_data
		});

		var input7_initial_data = {
		 	col: "s12",
		 	label: "reg_date",
		 	id: "reg_date",
		 	type: "text"
		 };
		var input7 = new Input({
			root: component.root,
			store: component.store,
			data: input7_initial_data
		});

		var editor_initial_data = { id: "description" };
		if (ctx.editor !== void 0) {
			editor_initial_data.editor = ctx.editor;
			editor_updating.editor = true;
		}
		var editor = new Editor({
			root: component.root,
			store: component.store,
			data: editor_initial_data,
			_bind(changed, childState) {
				var newState = {};
				if (!editor_updating.editor && changed.editor) {
					newState.editor = childState.editor;
				}
				component._set(newState);
				editor_updating = {};
			}
		});

		component.root._beforecreate.push(() => {
			editor._bind({ editor: 1 }, editor.get());
		});

		return {
			c: function create() {
				select._fragment.c();
				text0 = createText("\r\n                                        ");
				input0._fragment.c();
				text1 = createText("\r\n                                        ");
				input1._fragment.c();
				text2 = createText("\r\n                                        ");
				input2._fragment.c();
				text3 = createText("\r\n                                        ");
				input3._fragment.c();
				text4 = createText("\r\n                                        ");
				input4._fragment.c();
				text5 = createText("\r\n                                        ");
				input5._fragment.c();
				text6 = createText("\r\n                                        ");
				input6._fragment.c();
				text7 = createText("\r\n                                        ");
				input7._fragment.c();
				text8 = createText("\r\n                                        ");
				editor._fragment.c();
				text9 = createText("\r\n                                        ");
				label = createElement("label");
				label.textContent = "description";
				label.htmlFor = "description";
				addLoc(label, file$m, 62, 40, 5392);
			},

			m: function mount(target, anchor) {
				select._mount(target, anchor);
				insert(target, text0, anchor);
				input0._mount(target, anchor);
				insert(target, text1, anchor);
				input1._mount(target, anchor);
				insert(target, text2, anchor);
				input2._mount(target, anchor);
				insert(target, text3, anchor);
				input3._mount(target, anchor);
				insert(target, text4, anchor);
				input4._mount(target, anchor);
				insert(target, text5, anchor);
				input5._mount(target, anchor);
				insert(target, text6, anchor);
				input6._mount(target, anchor);
				insert(target, text7, anchor);
				input7._mount(target, anchor);
				insert(target, text8, anchor);
				editor._mount(target, anchor);
				insert(target, text9, anchor);
				insert(target, label, anchor);
				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				var select_changes = {};
				if (changed.getusers) select_changes.options = ctx.users;
				select._set(select_changes);

				var editor_changes = {};
				if (!editor_updating.editor && changed.editor) {
					editor_changes.editor = ctx.editor;
					editor_updating.editor = ctx.editor !== void 0;
				}
				editor._set(editor_changes);
				editor_updating = {};
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 10);

				if (select) select._fragment.o(outrocallback);
				if (input0) input0._fragment.o(outrocallback);
				if (input1) input1._fragment.o(outrocallback);
				if (input2) input2._fragment.o(outrocallback);
				if (input3) input3._fragment.o(outrocallback);
				if (input4) input4._fragment.o(outrocallback);
				if (input5) input5._fragment.o(outrocallback);
				if (input6) input6._fragment.o(outrocallback);
				if (input7) input7._fragment.o(outrocallback);
				if (editor) editor._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				select.destroy(detach);
				if (detach) {
					detachNode(text0);
				}

				input0.destroy(detach);
				if (detach) {
					detachNode(text1);
				}

				input1.destroy(detach);
				if (detach) {
					detachNode(text2);
				}

				input2.destroy(detach);
				if (detach) {
					detachNode(text3);
				}

				input3.destroy(detach);
				if (detach) {
					detachNode(text4);
				}

				input4.destroy(detach);
				if (detach) {
					detachNode(text5);
				}

				input5.destroy(detach);
				if (detach) {
					detachNode(text6);
				}

				input6.destroy(detach);
				if (detach) {
					detachNode(text7);
				}

				input7.destroy(detach);
				if (detach) {
					detachNode(text8);
				}

				editor.destroy(detach);
				if (detach) {
					detachNode(text9);
					detachNode(label);
				}
			}
		};
	}

	// (50:45)                                   <Loading small/>                              {:then users}
	function create_pending_block_1$1(component, ctx) {
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

	// (28:36) {#if objModal}
	function create_if_block_4$2(component, ctx) {
		var text0, text1, text2, text3, text4, text5, text6, text7, text8, text9, text10, text11, text12, text13, text14, editor_updating = {}, text15, label, current;

		var input0_initial_data = {
		 	col: "s12",
		 	label: "cuid",
		 	id: "cuid",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.cuid : "",
		 	disabled: true
		 };
		var input0 = new Input({
			root: component.root,
			store: component.store,
			data: input0_initial_data
		});

		var input1_initial_data = {
		 	col: "s12",
		 	label: "user ID",
		 	id: "user_id",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.user_id : "",
		 	disabled: true
		 };
		var input1 = new Input({
			root: component.root,
			store: component.store,
			data: input1_initial_data
		});

		var input2_initial_data = {
		 	col: "s12",
		 	label: "email",
		 	id: "email",
		 	type: "email",
		 	value: ctx.crudindex === 1 ? ctx.objModal.email : "",
		 	disabled: true
		 };
		var input2 = new Input({
			root: component.root,
			store: component.store,
			data: input2_initial_data
		});

		var input3_initial_data = {
		 	col: "s12",
		 	label: "firstname",
		 	id: "firstname",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.firstname : "",
		 	disabled: true
		 };
		var input3 = new Input({
			root: component.root,
			store: component.store,
			data: input3_initial_data
		});

		var input4_initial_data = {
		 	col: "s12",
		 	label: "lastname",
		 	id: "lastname",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.lastname : "",
		 	disabled: true
		 };
		var input4 = new Input({
			root: component.root,
			store: component.store,
			data: input4_initial_data
		});

		var input5_initial_data = {
		 	col: "s12",
		 	label: "country",
		 	id: "country",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.country : ""
		 };
		var input5 = new Input({
			root: component.root,
			store: component.store,
			data: input5_initial_data
		});

		var input6_initial_data = {
		 	col: "s12",
		 	label: "university",
		 	id: "university",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.university : ""
		 };
		var input6 = new Input({
			root: component.root,
			store: component.store,
			data: input6_initial_data
		});

		var input7_initial_data = {
		 	col: "s12",
		 	label: "education_language",
		 	id: "education_language",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.education_language : ""
		 };
		var input7 = new Input({
			root: component.root,
			store: component.store,
			data: input7_initial_data
		});

		var input8_initial_data = {
		 	col: "s12",
		 	label: "cv",
		 	id: "cv",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.cv : ""
		 };
		var input8 = new Input({
			root: component.root,
			store: component.store,
			data: input8_initial_data
		});

		var input9_initial_data = {
		 	col: "s12",
		 	label: "sop",
		 	id: "sop",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.sop : ""
		 };
		var input9 = new Input({
			root: component.root,
			store: component.store,
			data: input9_initial_data
		});

		var input10_initial_data = {
		 	col: "s12",
		 	label: "rc",
		 	id: "rc",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.rc : ""
		 };
		var input10 = new Input({
			root: component.root,
			store: component.store,
			data: input10_initial_data
		});

		var input11_initial_data = {
		 	col: "s12",
		 	label: "field",
		 	id: "field",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.field : ""
		 };
		var input11 = new Input({
			root: component.root,
			store: component.store,
			data: input11_initial_data
		});

		var input12_initial_data = {
		 	col: "s12",
		 	label: "created at",
		 	id: "created_at",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.created_at : "",
		 	disabled: true
		 };
		var input12 = new Input({
			root: component.root,
			store: component.store,
			data: input12_initial_data
		});

		var input13_initial_data = {
		 	col: "s12",
		 	label: "updated at",
		 	id: "updated_at",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.updated_at : "",
		 	disabled: true
		 };
		var input13 = new Input({
			root: component.root,
			store: component.store,
			data: input13_initial_data
		});

		var input14_initial_data = {
		 	col: "s12",
		 	label: "reg_date",
		 	id: "reg_date",
		 	type: "text",
		 	value: ctx.crudindex === 1 ? ctx.objModal.reg_date : ""
		 };
		var input14 = new Input({
			root: component.root,
			store: component.store,
			data: input14_initial_data
		});

		var editor_initial_data = {
		 	id: "Editdescription",
		 	initial: ctx.crudindex === 1 ? ctx.objModal.description : ""
		 };
		if (ctx.editor !== void 0) {
			editor_initial_data.editor = ctx.editor;
			editor_updating.editor = true;
		}
		var editor = new Editor({
			root: component.root,
			store: component.store,
			data: editor_initial_data,
			_bind(changed, childState) {
				var newState = {};
				if (!editor_updating.editor && changed.editor) {
					newState.editor = childState.editor;
				}
				component._set(newState);
				editor_updating = {};
			}
		});

		component.root._beforecreate.push(() => {
			editor._bind({ editor: 1 }, editor.get());
		});

		return {
			c: function create() {
				input0._fragment.c();
				text0 = createText("\r\n                                        ");
				input1._fragment.c();
				text1 = createText("\r\n                                        ");
				input2._fragment.c();
				text2 = createText("\r\n                                        ");
				input3._fragment.c();
				text3 = createText("\r\n                                        ");
				input4._fragment.c();
				text4 = createText("\r\n                                        ");
				input5._fragment.c();
				text5 = createText("\r\n                                        ");
				input6._fragment.c();
				text6 = createText("\r\n                                        ");
				input7._fragment.c();
				text7 = createText("\r\n                                        ");
				input8._fragment.c();
				text8 = createText("\r\n                                        ");
				input9._fragment.c();
				text9 = createText("\r\n                                        ");
				input10._fragment.c();
				text10 = createText("\r\n                                        ");
				input11._fragment.c();
				text11 = createText("\r\n                                        ");
				input12._fragment.c();
				text12 = createText("\r\n                                        ");
				input13._fragment.c();
				text13 = createText("\r\n                                        ");
				input14._fragment.c();
				text14 = createText("\r\n                                        ");
				editor._fragment.c();
				text15 = createText("\r\n                                        ");
				label = createElement("label");
				label.textContent = "description";
				label.htmlFor = "description";
				addLoc(label, file$m, 44, 40, 3992);
			},

			m: function mount(target, anchor) {
				input0._mount(target, anchor);
				insert(target, text0, anchor);
				input1._mount(target, anchor);
				insert(target, text1, anchor);
				input2._mount(target, anchor);
				insert(target, text2, anchor);
				input3._mount(target, anchor);
				insert(target, text3, anchor);
				input4._mount(target, anchor);
				insert(target, text4, anchor);
				input5._mount(target, anchor);
				insert(target, text5, anchor);
				input6._mount(target, anchor);
				insert(target, text6, anchor);
				input7._mount(target, anchor);
				insert(target, text7, anchor);
				input8._mount(target, anchor);
				insert(target, text8, anchor);
				input9._mount(target, anchor);
				insert(target, text9, anchor);
				input10._mount(target, anchor);
				insert(target, text10, anchor);
				input11._mount(target, anchor);
				insert(target, text11, anchor);
				input12._mount(target, anchor);
				insert(target, text12, anchor);
				input13._mount(target, anchor);
				insert(target, text13, anchor);
				input14._mount(target, anchor);
				insert(target, text14, anchor);
				editor._mount(target, anchor);
				insert(target, text15, anchor);
				insert(target, label, anchor);
				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				var input0_changes = {};
				if (changed.crudindex || changed.objModal) input0_changes.value = ctx.crudindex === 1 ? ctx.objModal.cuid : "";
				input0._set(input0_changes);

				var input1_changes = {};
				if (changed.crudindex || changed.objModal) input1_changes.value = ctx.crudindex === 1 ? ctx.objModal.user_id : "";
				input1._set(input1_changes);

				var input2_changes = {};
				if (changed.crudindex || changed.objModal) input2_changes.value = ctx.crudindex === 1 ? ctx.objModal.email : "";
				input2._set(input2_changes);

				var input3_changes = {};
				if (changed.crudindex || changed.objModal) input3_changes.value = ctx.crudindex === 1 ? ctx.objModal.firstname : "";
				input3._set(input3_changes);

				var input4_changes = {};
				if (changed.crudindex || changed.objModal) input4_changes.value = ctx.crudindex === 1 ? ctx.objModal.lastname : "";
				input4._set(input4_changes);

				var input5_changes = {};
				if (changed.crudindex || changed.objModal) input5_changes.value = ctx.crudindex === 1 ? ctx.objModal.country : "";
				input5._set(input5_changes);

				var input6_changes = {};
				if (changed.crudindex || changed.objModal) input6_changes.value = ctx.crudindex === 1 ? ctx.objModal.university : "";
				input6._set(input6_changes);

				var input7_changes = {};
				if (changed.crudindex || changed.objModal) input7_changes.value = ctx.crudindex === 1 ? ctx.objModal.education_language : "";
				input7._set(input7_changes);

				var input8_changes = {};
				if (changed.crudindex || changed.objModal) input8_changes.value = ctx.crudindex === 1 ? ctx.objModal.cv : "";
				input8._set(input8_changes);

				var input9_changes = {};
				if (changed.crudindex || changed.objModal) input9_changes.value = ctx.crudindex === 1 ? ctx.objModal.sop : "";
				input9._set(input9_changes);

				var input10_changes = {};
				if (changed.crudindex || changed.objModal) input10_changes.value = ctx.crudindex === 1 ? ctx.objModal.rc : "";
				input10._set(input10_changes);

				var input11_changes = {};
				if (changed.crudindex || changed.objModal) input11_changes.value = ctx.crudindex === 1 ? ctx.objModal.field : "";
				input11._set(input11_changes);

				var input12_changes = {};
				if (changed.crudindex || changed.objModal) input12_changes.value = ctx.crudindex === 1 ? ctx.objModal.created_at : "";
				input12._set(input12_changes);

				var input13_changes = {};
				if (changed.crudindex || changed.objModal) input13_changes.value = ctx.crudindex === 1 ? ctx.objModal.updated_at : "";
				input13._set(input13_changes);

				var input14_changes = {};
				if (changed.crudindex || changed.objModal) input14_changes.value = ctx.crudindex === 1 ? ctx.objModal.reg_date : "";
				input14._set(input14_changes);

				var editor_changes = {};
				if (changed.crudindex || changed.objModal) editor_changes.initial = ctx.crudindex === 1 ? ctx.objModal.description : "";
				if (!editor_updating.editor && changed.editor) {
					editor_changes.editor = ctx.editor;
					editor_updating.editor = ctx.editor !== void 0;
				}
				editor._set(editor_changes);
				editor_updating = {};
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 16);

				if (input0) input0._fragment.o(outrocallback);
				if (input1) input1._fragment.o(outrocallback);
				if (input2) input2._fragment.o(outrocallback);
				if (input3) input3._fragment.o(outrocallback);
				if (input4) input4._fragment.o(outrocallback);
				if (input5) input5._fragment.o(outrocallback);
				if (input6) input6._fragment.o(outrocallback);
				if (input7) input7._fragment.o(outrocallback);
				if (input8) input8._fragment.o(outrocallback);
				if (input9) input9._fragment.o(outrocallback);
				if (input10) input10._fragment.o(outrocallback);
				if (input11) input11._fragment.o(outrocallback);
				if (input12) input12._fragment.o(outrocallback);
				if (input13) input13._fragment.o(outrocallback);
				if (input14) input14._fragment.o(outrocallback);
				if (editor) editor._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				input0.destroy(detach);
				if (detach) {
					detachNode(text0);
				}

				input1.destroy(detach);
				if (detach) {
					detachNode(text1);
				}

				input2.destroy(detach);
				if (detach) {
					detachNode(text2);
				}

				input3.destroy(detach);
				if (detach) {
					detachNode(text3);
				}

				input4.destroy(detach);
				if (detach) {
					detachNode(text4);
				}

				input5.destroy(detach);
				if (detach) {
					detachNode(text5);
				}

				input6.destroy(detach);
				if (detach) {
					detachNode(text6);
				}

				input7.destroy(detach);
				if (detach) {
					detachNode(text7);
				}

				input8.destroy(detach);
				if (detach) {
					detachNode(text8);
				}

				input9.destroy(detach);
				if (detach) {
					detachNode(text9);
				}

				input10.destroy(detach);
				if (detach) {
					detachNode(text10);
				}

				input11.destroy(detach);
				if (detach) {
					detachNode(text11);
				}

				input12.destroy(detach);
				if (detach) {
					detachNode(text12);
				}

				input13.destroy(detach);
				if (detach) {
					detachNode(text13);
				}

				input14.destroy(detach);
				if (detach) {
					detachNode(text14);
				}

				editor.destroy(detach);
				if (detach) {
					detachNode(text15);
					detachNode(label);
				}
			}
		};
	}

	// (4:21)           <Loading small/>      {:then infos}
	function create_pending_block$5(component, ctx) {
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

	function ApplyCenter(options) {
		this._debugName = '<ApplyCenter>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data$h(), options.data);
		if (!('getinfos' in this._state)) console.warn("<ApplyCenter> was created without expected data property 'getinfos'");
		if (!('crudindex' in this._state)) console.warn("<ApplyCenter> was created without expected data property 'crudindex'");
		if (!('objModal' in this._state)) console.warn("<ApplyCenter> was created without expected data property 'objModal'");
		if (!('editor' in this._state)) console.warn("<ApplyCenter> was created without expected data property 'editor'");
		if (!('getusers' in this._state)) console.warn("<ApplyCenter> was created without expected data property 'getusers'");
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$m(this, this._state);

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}

		this._intro = true;
	}

	assign(ApplyCenter.prototype, protoDev);
	assign(ApplyCenter.prototype, methods$c);

	ApplyCenter.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\panel\user_pages\ApplyProcess.html generated by Svelte v2.16.1 */

	function data$i(){
	    var mob = {data: null};
	    return {
	        objModal: null,
	        mob,
	        getinfos: utils.fetch(`/student-control/getAll/${cdsuser.id}`)
	        .then(response => {
	            var mobs = response.body;
	                mob.data = mobs;
	                var rows = [];
	                for(var mb of mobs) {
	                        var info = {
	                            id : mb.id,
	                            country: mb.country,
	                            university: mb.university,
	                            education_language: mb.education_language,
	                            cv: mb.cv,
	                            sop: mb.sop,
	                            rc: mb.rc,
	                            field: mb.field,
	                            reg_date: mb.reg_date
	                        };
	                        // [ show description ]
	                        info.actions = [
	                            [2].includes(cdsuser.access)
	                        ];
	                        rows.push(info);
	                }
	                return rows;
	            })
	            .catch(err => utils.toast("something went wrong !")),
	    }
	}
	var methods$d = {
	    open({obj}){
	            const mob = this.get().mob.data;
	            for(var mb of mob){
	                if(obj.id === mb.id) {
	                    this.set({objModal: mb}); 
	                }
	            }
	            var elems = document.querySelector('.modal');
	            var instances = M.Modal.init(elems, {});
	            instances.open();
	    },
	    close(){
	        var elems = document.querySelector('.modal');
	        var instances = M.Modal.init(elems, {});
	        instances.close();
	    }
	};

	const file$n = "ui\\panel\\user_pages\\ApplyProcess.html";

	function create_main_fragment$n(component, ctx) {
		var div, promise, current;

		let info = {
			component,
			ctx,
			current: null,
			pending: create_pending_block$6,
			then: create_then_block$6,
			catch: create_catch_block$6,
			value: 'infos',
			error: 'err',
			blocks: Array(3)
		};

		handlePromise(promise = ctx.getinfos, info);

		return {
			c: function create() {
				div = createElement("div");

				info.block.c();
				div.className = "row";
				addLoc(div, file$n, 2, 0, 42);
			},

			m: function mount(target, anchor) {
				insert(target, div, anchor);

				info.block.i(div, info.anchor = null);
				info.mount = () => div;
				info.anchor = null;

				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				info.ctx = ctx;

				if (('getinfos' in changed) && promise !== (promise = ctx.getinfos) && handlePromise(promise, info)) ; else {
					info.block.p(changed, assign(assign({}, ctx), info.resolved));
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				const countdown = callAfter(outrocallback, 3);
				for (let i = 0; i < 3; i += 1) {
					const block = info.blocks[i];
					if (block) block.o(countdown);
					else countdown();
				}

				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div);
				}

				info.block.d();
				info = null;
			}
		};
	}

	// (34:4) {:catch err}
	function create_catch_block$6(component, ctx) {
		var p, text0, text1_value = ctx.err.message, text1, current;

		return {
			c: function create() {
				p = createElement("p");
				text0 = createText("Error ");
				text1 = createText(text1_value);
				addLoc(p, file$n, 34, 8, 1314);
			},

			m: function mount(target, anchor) {
				insert(target, p, anchor);
				append(p, text0);
				append(p, text1);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.getinfos) && text1_value !== (text1_value = ctx.err.message)) {
					setData(text1, text1_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(p);
				}
			}
		};
	}

	// (6:4) {:then infos}
	function create_then_block$6(component, ctx) {
		var div2, div0, h4, text1, text2, div1, button, text4, current;

		var if_block = (ctx.objModal) && create_if_block$c(component, ctx);

		function click_handler(event) {
			component.close();
		}

		var table_initial_data = {
		 	highlight: true,
		 	rows: 3,
		 	content: ctx.infos,
		 	search: ["description", "sop", "cv", "field", "education_language", 
	                     "country", "university", "rc", "reg_date", "cuid", "status", "id"],
		 	actions: [
	                {icon: "remove_red_eye", tooltip: "مشاهده توضیحات", action(obj, component) {
	                           component.fire("modal", {obj});
	                        }
	                }, 
	            ]
		 };
		var table = new Table({
			root: component.root,
			store: component.store,
			data: table_initial_data
		});

		table.on("modal", function(event) {
			component.open(event);
		});

		return {
			c: function create() {
				div2 = createElement("div");
				div0 = createElement("div");
				h4 = createElement("h4");
				h4.textContent = "توضیحات اضافه";
				text1 = createText("\r\n                        ");
				if (if_block) if_block.c();
				text2 = createText("\r\n                ");
				div1 = createElement("div");
				button = createElement("button");
				button.textContent = "Close";
				text4 = createText(" \r\n\r\n        ");
				table._fragment.c();
				addLoc(h4, file$n, 10, 20, 315);
				div0.className = "modal-content";
				addLoc(div0, file$n, 9, 16, 266);
				addListener(button, "click", click_handler);
				button.className = "modal-close waves-effect waves-green btn-flat";
				addLoc(button, file$n, 16, 20, 579);
				div1.className = "modal-footer";
				addLoc(div1, file$n, 15, 16, 531);
				div2.id = "modalshow";
				div2.className = "modal";
				addLoc(div2, file$n, 8, 12, 214);
			},

			m: function mount(target, anchor) {
				insert(target, div2, anchor);
				append(div2, div0);
				append(div0, h4);
				append(div0, text1);
				if (if_block) if_block.m(div0, null);
				append(div2, text2);
				append(div2, div1);
				append(div1, button);
				insert(target, text4, anchor);
				table._mount(target, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				if (ctx.objModal) {
					if (if_block) {
						if_block.p(changed, ctx);
					} else {
						if_block = create_if_block$c(component, ctx);
						if_block.c();
						if_block.m(div0, null);
					}
				} else if (if_block) {
					if_block.d(1);
					if_block = null;
				}

				var table_changes = {};
				if (changed.getinfos) table_changes.content = ctx.infos;
				table._set(table_changes);
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				if (table) table._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div2);
				}

				if (if_block) if_block.d();
				removeListener(button, "click", click_handler);
				if (detach) {
					detachNode(text4);
				}

				table.destroy(detach);
			}
		};
	}

	// (12:24) {#if objModal}
	function create_if_block$c(component, ctx) {
		var raw_value = ctx.objModal.description, raw_before, raw_after;

		return {
			c: function create() {
				raw_before = createElement('noscript');
				raw_after = createElement('noscript');
			},

			m: function mount(target, anchor) {
				insert(target, raw_before, anchor);
				raw_before.insertAdjacentHTML("afterend", raw_value);
				insert(target, raw_after, anchor);
			},

			p: function update(changed, ctx) {
				if ((changed.objModal) && raw_value !== (raw_value = ctx.objModal.description)) {
					detachBetween(raw_before, raw_after);
					raw_before.insertAdjacentHTML("afterend", raw_value);
				}
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachBetween(raw_before, raw_after);
					detachNode(raw_before);
					detachNode(raw_after);
				}
			}
		};
	}

	// (4:21)           <Loading small/>      {:then infos}
	function create_pending_block$6(component, ctx) {
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

	function ApplyProcess(options) {
		this._debugName = '<ApplyProcess>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data$i(), options.data);
		if (!('getinfos' in this._state)) console.warn("<ApplyProcess> was created without expected data property 'getinfos'");
		if (!('objModal' in this._state)) console.warn("<ApplyProcess> was created without expected data property 'objModal'");
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$n(this, this._state);

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}

		this._intro = true;
	}

	assign(ApplyProcess.prototype, protoDev);
	assign(ApplyProcess.prototype, methods$d);

	ApplyProcess.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\panel\user_pages\ReservingConsultancyTime.html generated by Svelte v2.16.1 */

	function data$j(){
	    return {
	        objModal: null,
	        getfreetims: utils.fetch(`/free-time/available`)
	        .then(response => {
	            var freetimes = response.body;
	                var rows = [];
	                for(var ft of freetimes) {
	                        // [ show description ]
	                        ft.actions = [
	                            [7].includes(cdsuser.access)
	                        ];
	                        rows.push(ft);
	                }
	                return rows;
	            })
	            .catch(err => utils.toast("something went wrong !")),
	    }
	}
	var methods$e = {
	    open({obj}){
	            
	            this.set({objModal: obj});
	            var elems = document.querySelector('.modal');
	            var instances = M.Modal.init(elems, {});
	            instances.open();
	    },
	    close(){
	        var elems = document.querySelector('.modal');
	        var instances = M.Modal.init(elems, {});
	        instances.close();
	    },
	    pay(id){

	        const user_id = cdsuser.id;
	        
	        // block this free-time to avoid conflict payment issues
	        utils.fetch(`/free-time/block/${id}`, {})
	            .then((res)=>{
	                if(res.status!=200){
	                    utils.toast("something went wrong !");
	                    utils.reload();
	                } else{
	                    utils.toast("در حال اتصال به درگاه...");
	                }
	            }).catch(err=>{
	                utils.toast('مشکل اتصال به درگاه ...');
	                utils.reload();
	            });



	        // TODO payment api
	        // ...
	        // redirect => PaymentRedirect.html
	        //          on:valid:
	        //             on:success >> msg success
	        //             on:failur >> msg failur and update status to 1
	        //          on:invalid:
	        //             alert >> no payment process exists



	}
	};

	const file$o = "ui\\panel\\user_pages\\ReservingConsultancyTime.html";

	function create_main_fragment$o(component, ctx) {
		var div, await_block_anchor, promise, current;

		let info = {
			component,
			ctx,
			current: null,
			pending: create_pending_block$7,
			then: create_then_block$7,
			catch: create_catch_block$7,
			value: 'freetimes',
			error: 'err',
			blocks: Array(3)
		};

		handlePromise(promise = ctx.getfreetims, info);

		var card_initial_data = {
		 	image: "/public/img/privacy.png",
		 	col: "s12 m10 offset-m1 l10 offset-l1"
		 };
		var card = new Card({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: card_initial_data
		});

		return {
			c: function create() {
				div = createElement("div");
				await_block_anchor = createComment();

				info.block.c();

				card._fragment.c();
				div.className = "row";
				addLoc(div, file$o, 2, 0, 42);
			},

			m: function mount(target, anchor) {
				insert(target, div, anchor);
				append(card._slotted.default, await_block_anchor);

				info.block.i(card._slotted.default, info.anchor = null);
				info.mount = () => await_block_anchor.parentNode;
				info.anchor = await_block_anchor;

				card._mount(div, null);
				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				info.ctx = ctx;

				if (('getfreetims' in changed) && promise !== (promise = ctx.getfreetims) && handlePromise(promise, info)) ; else {
					info.block.p(changed, assign(assign({}, ctx), info.resolved));
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 2);

				const countdown = callAfter(outrocallback, 3);
				for (let i = 0; i < 3; i += 1) {
					const block = info.blocks[i];
					if (block) block.o(countdown);
					else countdown();
				}

				if (card) card._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div);
				}

				info.block.d();
				info = null;

				card.destroy();
			}
		};
	}

	// (48:4) {:catch err}
	function create_catch_block$7(component, ctx) {
		var p, text0, text1_value = ctx.err.message, text1, current;

		return {
			c: function create() {
				p = createElement("p");
				text0 = createText("Error ");
				text1 = createText(text1_value);
				addLoc(p, file$o, 48, 8, 1841);
			},

			m: function mount(target, anchor) {
				insert(target, p, anchor);
				append(p, text0);
				append(p, text1);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.getfreetims) && text1_value !== (text1_value = ctx.err.message)) {
					setData(text1, text1_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(p);
				}
			}
		};
	}

	// (7:4) {:then freetimes}
	function create_then_block$7(component, ctx) {
		var div2, div0, h4, text1, text2, div1, button, text4, current;

		var if_block = (ctx.objModal) && create_if_block$d(component, ctx);

		function click_handler(event) {
			component.close();
		}

		var table_initial_data = {
		 	highlight: true,
		 	rows: 3,
		 	content: ctx.freetimes,
		 	search: ["id", "time", "date", "price"],
		 	actions: [
	                {icon: "account_balance", tooltip: "رزرو", action(obj, component) {
	                           component.fire("modal", {obj});
	                        }
	                }, 
	            ]
		 };
		var table = new Table({
			root: component.root,
			store: component.store,
			data: table_initial_data
		});

		table.on("modal", function(event) {
			component.open(event);
		});

		return {
			c: function create() {
				div2 = createElement("div");
				div0 = createElement("div");
				h4 = createElement("h4");
				h4.textContent = "رزرو وقت مشاوره";
				text1 = createText("\r\n                        ");
				if (if_block) if_block.c();
				text2 = createText("\r\n                ");
				div1 = createElement("div");
				button = createElement("button");
				button.textContent = "Close";
				text4 = createText(" \r\n\r\n        ");
				table._fragment.c();
				addLoc(h4, file$o, 11, 20, 400);
				div0.className = "modal-content";
				addLoc(div0, file$o, 10, 16, 351);
				addListener(button, "click", click_handler);
				button.className = "modal-close waves-effect waves-green btn-flat";
				addLoc(button, file$o, 31, 20, 1229);
				div1.className = "modal-footer";
				addLoc(div1, file$o, 30, 16, 1181);
				div2.id = "modalshow";
				div2.className = "modal";
				addLoc(div2, file$o, 9, 12, 299);
			},

			m: function mount(target, anchor) {
				insert(target, div2, anchor);
				append(div2, div0);
				append(div0, h4);
				append(div0, text1);
				if (if_block) if_block.m(div0, null);
				append(div2, text2);
				append(div2, div1);
				append(div1, button);
				insert(target, text4, anchor);
				table._mount(target, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				if (ctx.objModal) {
					if (if_block) {
						if_block.p(changed, ctx);
					} else {
						if_block = create_if_block$d(component, ctx);
						if_block.c();
						if_block.m(div0, null);
					}
				} else if (if_block) {
					if_block.d(1);
					if_block = null;
				}

				var table_changes = {};
				if (changed.getfreetims) table_changes.content = ctx.freetimes;
				table._set(table_changes);
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				if (table) table._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div2);
				}

				if (if_block) if_block.d();
				removeListener(button, "click", click_handler);
				if (detach) {
					detachNode(text4);
				}

				table.destroy(detach);
			}
		};
	}

	// (13:24) {#if objModal}
	function create_if_block$d(component, ctx) {
		var text0, div0, text1_value = ctx.objModal.date, text1, text2, div1, text3_value = ctx.objModal.time, text3, text4, div2, text5_value = ctx.objModal.price, text5, text6, a, text7, i;

		function click_handler(event) {
			component.pay(ctx.objModal.id);
		}

		return {
			c: function create() {
				text0 = createText("رزرو مشاوره در روز \r\n                                ");
				div0 = createElement("div");
				text1 = createText(text1_value);
				text2 = createText("\r\n                                در ساعت\r\n                                ");
				div1 = createElement("div");
				text3 = createText(text3_value);
				text4 = createText("\r\n                                به قیمت\r\n                                ");
				div2 = createElement("div");
				text5 = createText(text5_value);
				text6 = createText("\r\n                                تومان.\r\n\r\n\r\n                            ");
				a = createElement("a");
				text7 = createText("پرداخت\r\n                                ");
				i = createElement("i");
				i.textContent = "send";
				addLoc(div0, file$o, 15, 32, 553);
				addLoc(div1, file$o, 17, 32, 654);
				addLoc(div2, file$o, 19, 32, 755);
				i.className = "material-icons left";
				addLoc(i, file$o, 25, 32, 1016);
				addListener(a, "click", click_handler);
				a.className = "btn waves-effect waves-light black-text yellow";
				addLoc(a, file$o, 23, 28, 856);
			},

			m: function mount(target, anchor) {
				insert(target, text0, anchor);
				insert(target, div0, anchor);
				append(div0, text1);
				insert(target, text2, anchor);
				insert(target, div1, anchor);
				append(div1, text3);
				insert(target, text4, anchor);
				insert(target, div2, anchor);
				append(div2, text5);
				insert(target, text6, anchor);
				insert(target, a, anchor);
				append(a, text7);
				append(a, i);
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				if ((changed.objModal) && text1_value !== (text1_value = ctx.objModal.date)) {
					setData(text1, text1_value);
				}

				if ((changed.objModal) && text3_value !== (text3_value = ctx.objModal.time)) {
					setData(text3, text3_value);
				}

				if ((changed.objModal) && text5_value !== (text5_value = ctx.objModal.price)) {
					setData(text5, text5_value);
				}
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(text0);
					detachNode(div0);
					detachNode(text2);
					detachNode(div1);
					detachNode(text4);
					detachNode(div2);
					detachNode(text6);
					detachNode(a);
				}

				removeListener(a, "click", click_handler);
			}
		};
	}

	// (5:24)           <Loading small/>      {:then freetimes}
	function create_pending_block$7(component, ctx) {
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

	function ReservingConsultancyTime(options) {
		this._debugName = '<ReservingConsultancyTime>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data$j(), options.data);
		if (!('getfreetims' in this._state)) console.warn("<ReservingConsultancyTime> was created without expected data property 'getfreetims'");
		if (!('objModal' in this._state)) console.warn("<ReservingConsultancyTime> was created without expected data property 'objModal'");
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$o(this, this._state);

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}

		this._intro = true;
	}

	assign(ReservingConsultancyTime.prototype, protoDev);
	assign(ReservingConsultancyTime.prototype, methods$e);

	ReservingConsultancyTime.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\panel\user_pages\Consultations.html generated by Svelte v2.16.1 */

	function create_main_fragment$p(component, ctx) {

		return {
			c: noop,

			m: noop,

			p: noop,

			i: noop,

			o: run,

			d: noop
		};
	}

	function Consultations(options) {
		this._debugName = '<Consultations>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign({}, options.data);
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$p(this, this._state);

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);
		}

		this._intro = true;
	}

	assign(Consultations.prototype, protoDev);

	Consultations.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\panel\user_pages\faSecurityPolicy.html generated by Svelte v2.16.1 */

	function data$k() {
	  const user = window.cdsuser;
	  return {
	    user,
	    changeInfo: null
	  };
	}
	var methods$f = {
	  logout() {
	    utils.fetch("/auth/logout",).catch(err => utils.toast("can't log out !"));
	  },
	  updateUser() {
	    const elemail = document.getElementById("email");
	    const elfirst = document.getElementById("firstname");
	    const ellast = document.getElementById("lastname");
	    const elpassword = document.getElementById("password");
	    const elconfirm = document.getElementById("confirm");

	    const email = elemail.value ? elemail.value : null;
	    const firstname = elfirst.value ? elfirst.value : null;
	    const lastname = ellast.value ? ellast.value : null;
	    var password = elpassword.value == elconfirm.value ? elpassword.value : {err: true};
	    if(password.err) {
	      utils.toast("passwords don't match");
	      return;
	    }    password = password ? password : null;
	    utils
	      .fetch("/user/update", { email, firstname, lastname, password })
	      .then(res => {
	          if(res.status != 200)
	              throw "not ok";
	          else
	             utils.toast("Done");
	             utils.reload();
	      })
	      .catch(err => utils.toast("something went wrong !"));
	  },
	  uploadAvatar() {
	    utils
	      .upload("/user/avatar", "avatarpicker")
	      .then(res => {
	          if(res.status != 200)
	              throw "not ok";
	          else
	             utils.toast("Done");
	             utils.reload();
	      })
	      .catch(err => utils.toast("something went wrong !"));
	  }
	};

	const file$q = "ui\\panel\\user_pages\\faSecurityPolicy.html";

	function create_main_fragment$q(component, ctx) {
		var div0, h40, text0, text1_value = ctx.user.firstname ? ctx.user.firstname : "", text1, text2, p2, span0, text3, text4, h41, text6, p0, text7_value = ctx.user.firstname, text7, text8, text9_value = ctx.user.lastname, text9, text10, span1, text11_value = ctx.user.access === 2 ? "user" : ctx.user.access === 3 ? "mod" : ctx.user.access === 5 ? "admin" : ctx.user.access === 7 ? "dev" : "WHO ARE YOU ?! ", text11, text12, p1, text14, button0, text16, div1, h42, text18, p3, span2, text19, text20, br, text21, text22, text23, text24, text25, text26, button1, form_updating = {}, text28, div5, h43, span3, text29, text30, text31, div4, div2, span4, text33, input5, text34, div3, input6, text35, button2, current;

		var i0 = new Icon({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() }
		});

		var modal_initial_data = { id: "من که هستم ؟", buttons: [function Agree(c) {ctx.console.log(c);}] };
		var modal = new Modal({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: modal_initial_data
		});

		function click_handler(event) {
			component.logout();
		}

		var card0_initial_data = {
		 	image: "/user/avatar",
		 	col: "s12 m10 offset-m1 l8 offset-l2"
		 };
		var card0 = new Card({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: card0_initial_data
		});

		var i1 = new Icon({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() }
		});

		var input0_initial_data = {
		 	id: "email",
		 	label: "email",
		 	type: "email",
		 	validate: true,
		 	col: "s9"
		 };
		var input0 = new Input({
			root: component.root,
			store: component.store,
			data: input0_initial_data
		});

		var input1_initial_data = {
		 	id: "firstname",
		 	label: "first name",
		 	type: "text",
		 	validate: true,
		 	col: "s9"
		 };
		var input1 = new Input({
			root: component.root,
			store: component.store,
			data: input1_initial_data
		});

		var input2_initial_data = {
		 	id: "lastname",
		 	label: "last name",
		 	type: "text",
		 	validate: true,
		 	col: "s9"
		 };
		var input2 = new Input({
			root: component.root,
			store: component.store,
			data: input2_initial_data
		});

		var input3_initial_data = {
		 	id: "password",
		 	label: "password",
		 	type: "password",
		 	validate: true,
		 	col: "s9"
		 };
		var input3 = new Input({
			root: component.root,
			store: component.store,
			data: input3_initial_data
		});

		var input4_initial_data = {
		 	id: "confirm",
		 	label: "confirm",
		 	type: "password",
		 	validate: true,
		 	col: "s9"
		 };
		var input4 = new Input({
			root: component.root,
			store: component.store,
			data: input4_initial_data
		});

		function click_handler_1(event) {
			component.updateUser();
		}

		var form_initial_data = {};
		if (ctx.changeInfo !== void 0) {
			form_initial_data.response = ctx.changeInfo;
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
					newState.changeInfo = childState.response;
				}
				component._set(newState);
				form_updating = {};
			}
		});

		component.root._beforecreate.push(() => {
			form._bind({ response: 1 }, form.get());
		});

		var card1_initial_data = { col: "s12 m10 offset-m1 l8 offset-l2" };
		var card1 = new Card({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: card1_initial_data
		});

		var i2 = new Icon({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() }
		});

		function click_handler_2(event) {
			component.uploadAvatar();
		}

		var card2_initial_data = { col: "s12 m10 offset-m1 l8 offset-l2" };
		var card2 = new Card({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: card2_initial_data
		});

		return {
			c: function create() {
				div0 = createElement("div");
				h40 = createElement("h4");
				text0 = createText("درود - \r\n    ");
				text1 = createText(text1_value);
				text2 = createText("\r\n\t\t");
				p2 = createElement("p");
				span0 = createElement("span");
				text3 = createText("format_quote");
				i0._fragment.c();
				text4 = createText(" در اینجا میتوانید هویت خود را چک کنید\r\n\t\t");
				h41 = createElement("h4");
				h41.textContent = "شما";
				text6 = createText("\r\n\t\t\t");
				p0 = createElement("p");
				text7 = createText(text7_value);
				text8 = createText(" ");
				text9 = createText(text9_value);
				text10 = createText(" ");
				span1 = createElement("span");
				text11 = createText(text11_value);
				text12 = createText("\r\n\t\t  ");
				p1 = createElement("p");
				p1.textContent = "سایت هستید";
				modal._fragment.c();
				text14 = createText("\r\n\t\t");
				button0 = createElement("button");
				button0.textContent = "خروج";
				card0._fragment.c();
				text16 = createText("\r\n");
				div1 = createElement("div");
				h42 = createElement("h4");
				h42.textContent = "حساب شما";
				text18 = createText("\r\n\t\t");
				p3 = createElement("p");
				span2 = createElement("span");
				text19 = createText("format_quote");
				i1._fragment.c();
				text20 = createText("در زیر میتوانید اطلاعات شخصی خود را به روز رسانی کنید");
				br = createElement("br");
				text21 = createText("\r\n\t\t");
				input0._fragment.c();
				text22 = createText("\r\n\t\t\t");
				input1._fragment.c();
				text23 = createText("\r\n\t\t\t");
				input2._fragment.c();
				text24 = createText("\r\n\t\t\t");
				input3._fragment.c();
				text25 = createText("\r\n\t\t\t");
				input4._fragment.c();
				text26 = createText("\r\n\t\t\t");
				button1 = createElement("button");
				button1.textContent = "به روز رسانی";
				form._fragment.c();
				card1._fragment.c();
				text28 = createText("\r\n");
				div5 = createElement("div");
				h43 = createElement("h4");
				span3 = createElement("span");
				text29 = createText("format_quote");
				i2._fragment.c();
				text30 = createText(" آواتار خود را به روز رسانی کنید");
				text31 = createText("\r\n\t\t");
				div4 = createElement("div");
				div2 = createElement("div");
				span4 = createElement("span");
				span4.textContent = "انتخاب آواتار جدید";
				text33 = createText("\r\n\t\t\t\t");
				input5 = createElement("input");
				text34 = createText("\r\n\t\t\t");
				div3 = createElement("div");
				input6 = createElement("input");
				text35 = createText("\r\n        ");
				button2 = createElement("button");
				button2.textContent = "به روز رسانی";
				card2._fragment.c();
				addLoc(h40, file$q, 2, 2, 88);
				span0.className = "red-text";
				addLoc(span0, file$q, 5, 5, 161);
				addLoc(h41, file$q, 7, 3, 329);
				span1.className = "red-text";
				addLoc(span1, file$q, 8, 39, 382);
				addLoc(p0, file$q, 8, 3, 346);
				addLoc(p1, file$q, 9, 4, 557);
				addListener(button0, "click", click_handler);
				button0.className = "btn white red-text waves-effect waves-gray";
				addLoc(button0, file$q, 11, 2, 592);
				addLoc(p2, file$q, 5, 2, 158);
				div0.className = "row";
				addLoc(div0, file$q, 0, 0, 0);
				addLoc(h42, file$q, 16, 2, 769);
				span2.className = "red-text";
				addLoc(span2, file$q, 17, 5, 793);
				addLoc(br, file$q, 17, 107, 895);
				addLoc(p3, file$q, 17, 2, 790);
				addListener(button1, "click", click_handler_1);
				button1.className = "btn waves-effect waves-light yellow black-text col s4";
				addLoc(button1, file$q, 24, 3, 1323);
				div1.className = "row";
				addLoc(div1, file$q, 14, 0, 702);
				span3.className = "red-text";
				addLoc(span3, file$q, 30, 6, 1538);
				addLoc(h43, file$q, 30, 2, 1534);
				addLoc(span4, file$q, 33, 4, 1735);
				input5.id = "avatarpicker";
				setAttribute(input5, "type", "file");
				addLoc(input5, file$q, 34, 4, 1772);
				div2.className = "btn waves-effect waves-light black-text yellow";
				addLoc(div2, file$q, 32, 3, 1669);
				input6.className = "file-path validate";
				setAttribute(input6, "type", "text");
				addLoc(input6, file$q, 37, 4, 1862);
				div3.className = "file-path-wrapper";
				addLoc(div3, file$q, 36, 3, 1825);
				div4.className = "file-field input-field";
				addLoc(div4, file$q, 31, 2, 1628);
				addListener(button2, "click", click_handler_2);
				button2.className = "btn waves-effect waves-light black-text yellow submit";
				addLoc(button2, file$q, 40, 8, 1939);
				div5.className = "row";
				addLoc(div5, file$q, 28, 0, 1467);
			},

			m: function mount(target, anchor) {
				insert(target, div0, anchor);
				append(card0._slotted.default, h40);
				append(h40, text0);
				append(h40, text1);
				append(card0._slotted.default, text2);
				append(card0._slotted.default, p2);
				append(p2, span0);
				append(i0._slotted.default, text3);
				i0._mount(span0, null);
				append(p2, text4);
				append(modal._slotted.default, h41);
				append(modal._slotted.default, text6);
				append(modal._slotted.default, p0);
				append(p0, text7);
				append(p0, text8);
				append(p0, text9);
				append(p0, text10);
				append(p0, span1);
				append(span1, text11);
				append(modal._slotted.default, text12);
				append(modal._slotted.default, p1);
				modal._mount(p2, null);
				append(p2, text14);
				append(p2, button0);
				card0._mount(div0, null);
				insert(target, text16, anchor);
				insert(target, div1, anchor);
				append(card1._slotted.default, h42);
				append(card1._slotted.default, text18);
				append(card1._slotted.default, p3);
				append(p3, span2);
				append(i1._slotted.default, text19);
				i1._mount(span2, null);
				append(p3, text20);
				append(p3, br);
				append(card1._slotted.default, text21);
				input0._mount(form._slotted.default, null);
				append(form._slotted.default, text22);
				input1._mount(form._slotted.default, null);
				append(form._slotted.default, text23);
				input2._mount(form._slotted.default, null);
				append(form._slotted.default, text24);
				input3._mount(form._slotted.default, null);
				append(form._slotted.default, text25);
				input4._mount(form._slotted.default, null);
				append(form._slotted.default, text26);
				append(form._slotted.default, button1);
				form._mount(card1._slotted.default, null);
				card1._mount(div1, null);
				insert(target, text28, anchor);
				insert(target, div5, anchor);
				append(card2._slotted.default, h43);
				append(h43, span3);
				append(i2._slotted.default, text29);
				i2._mount(span3, null);
				append(h43, text30);
				append(card2._slotted.default, text31);
				append(card2._slotted.default, div4);
				append(div4, div2);
				append(div2, span4);
				append(div2, text33);
				append(div2, input5);
				append(div4, text34);
				append(div4, div3);
				append(div3, input6);
				append(card2._slotted.default, text35);
				append(card2._slotted.default, button2);
				card2._mount(div5, null);
				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				if ((!current || changed.user) && text1_value !== (text1_value = ctx.user.firstname ? ctx.user.firstname : "")) {
					setData(text1, text1_value);
				}

				if ((!current || changed.user) && text7_value !== (text7_value = ctx.user.firstname)) {
					setData(text7, text7_value);
				}

				if ((!current || changed.user) && text9_value !== (text9_value = ctx.user.lastname)) {
					setData(text9, text9_value);
				}

				if ((!current || changed.user) && text11_value !== (text11_value = ctx.user.access === 2 ? "user" : ctx.user.access === 3 ? "mod" : ctx.user.access === 5 ? "admin" : ctx.user.access === 7 ? "dev" : "WHO ARE YOU ?! ")) {
					setData(text11, text11_value);
				}

				var modal_changes = {};
				if (changed.console) modal_changes.buttons = [function Agree(c) {ctx.console.log(c);}];
				modal._set(modal_changes);

				var form_changes = {};
				if (!form_updating.response && changed.changeInfo) {
					form_changes.response = ctx.changeInfo;
					form_updating.response = ctx.changeInfo !== void 0;
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

				outrocallback = callAfter(outrocallback, 13);

				if (i0) i0._fragment.o(outrocallback);
				if (modal) modal._fragment.o(outrocallback);
				if (card0) card0._fragment.o(outrocallback);
				if (i1) i1._fragment.o(outrocallback);
				if (input0) input0._fragment.o(outrocallback);
				if (input1) input1._fragment.o(outrocallback);
				if (input2) input2._fragment.o(outrocallback);
				if (input3) input3._fragment.o(outrocallback);
				if (input4) input4._fragment.o(outrocallback);
				if (form) form._fragment.o(outrocallback);
				if (card1) card1._fragment.o(outrocallback);
				if (i2) i2._fragment.o(outrocallback);
				if (card2) card2._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(div0);
				}

				i0.destroy();
				modal.destroy();
				removeListener(button0, "click", click_handler);
				card0.destroy();
				if (detach) {
					detachNode(text16);
					detachNode(div1);
				}

				i1.destroy();
				input0.destroy();
				input1.destroy();
				input2.destroy();
				input3.destroy();
				input4.destroy();
				removeListener(button1, "click", click_handler_1);
				form.destroy();
				card1.destroy();
				if (detach) {
					detachNode(text28);
					detachNode(div5);
				}

				i2.destroy();
				removeListener(button2, "click", click_handler_2);
				card2.destroy();
			}
		};
	}

	function FaSecurityPolicy(options) {
		this._debugName = '<FaSecurityPolicy>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(assign({ console : console }, data$k()), options.data);
		if (!('user' in this._state)) console.warn("<FaSecurityPolicy> was created without expected data property 'user'");

		if (!('changeInfo' in this._state)) console.warn("<FaSecurityPolicy> was created without expected data property 'changeInfo'");
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$q(this, this._state);

		if (options.target) {
			if (options.hydrate) throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}

		this._intro = true;
	}

	assign(FaSecurityPolicy.prototype, protoDev);
	assign(FaSecurityPolicy.prototype, methods$f);

	FaSecurityPolicy.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\tags\Sidenav.html generated by Svelte v2.16.1 */

	function data$l() {
	  return {
					background: null,
					fixed: false,
	  };
	}
	function oncreate$7() {
	  var elems = document.querySelectorAll(".sidenav");
	  var instances = M.Sidenav.init(elems, {
	  	menuWidth: 100,
	  	edge: "left",
	  	closeOnClick: true,
	  	draggable: true
	  });
	}
	const file$r = "ui\\tags\\Sidenav.html";

	function create_main_fragment$r(component, ctx) {
		var nav, div0, ul0, li0, a0, text0, text1, ul1, text2, li1, a1, text3, text4, li2, div1, text5, slot_content_default = component._slotted.default, slot_content_default_before, slot_content_default_after, text6, br0, br1, br2, br3, ul1_class_value, current;

		var i0 = new Icon({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() }
		});

		var if_block = (ctx.background) && create_if_block$e(component, ctx);

		var i1 = new Icon({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() }
		});

		return {
			c: function create() {
				nav = createElement("nav");
				div0 = createElement("div");
				ul0 = createElement("ul");
				li0 = createElement("li");
				a0 = createElement("a");
				text0 = createText("menu");
				i0._fragment.c();
				text1 = createText("\r\n");
				ul1 = createElement("ul");
				if (if_block) if_block.c();
				text2 = createText("\r\n\t");
				li1 = createElement("li");
				a1 = createElement("a");
				text3 = createText("close");
				i1._fragment.c();
				text4 = createText("\r\n\t");
				li2 = createElement("li");
				div1 = createElement("div");
				text5 = createText("\r\n\t");
				text6 = createText("\r\n\t");
				br0 = createElement("br");
				br1 = createElement("br");
				br2 = createElement("br");
				br3 = createElement("br");
				a0.dataset.target = "slide-out";
				a0.className = "sidenav-trigger hide-on-large-only black-text";
				addLoc(a0, file$r, 4, 7, 182);
				addLoc(li0, file$r, 4, 3, 178);
				ul0.id = "nav-mobile";
				ul0.className = "left hide-on-large-only yellow";
				addLoc(ul0, file$r, 3, 2, 114);
				div0.className = "nav-wrapper yellow";
				addLoc(div0, file$r, 2, 1, 78);
				nav.className = "hide-on-large-only white";
				addLoc(nav, file$r, 1, 0, 37);
				a1.dataset.target = "slide-out";
				a1.className = "sidenav-close hide-on-large-only";
				addLoc(a1, file$r, 19, 5, 611);
				addLoc(li1, file$r, 19, 1, 607);
				div1.className = "divider";
				addLoc(div1, file$r, 20, 5, 707);
				addLoc(li2, file$r, 20, 1, 703);
				addLoc(br0, file$r, 27, 1, 875);
				addLoc(br1, file$r, 27, 5, 879);
				addLoc(br2, file$r, 27, 9, 883);
				addLoc(br3, file$r, 27, 13, 887);
				ul1.id = "slide-out";
				ul1.className = ul1_class_value = "col s10 m5 l3 sidenav " + (ctx.fixed ? "sidenav-fixed" : "");
				addLoc(ul1, file$r, 8, 0, 311);
			},

			m: function mount(target, anchor) {
				insert(target, nav, anchor);
				append(nav, div0);
				append(div0, ul0);
				append(ul0, li0);
				append(li0, a0);
				append(i0._slotted.default, text0);
				i0._mount(a0, null);
				insert(target, text1, anchor);
				insert(target, ul1, anchor);
				if (if_block) if_block.m(ul1, null);
				append(ul1, text2);
				append(ul1, li1);
				append(li1, a1);
				append(i1._slotted.default, text3);
				i1._mount(a1, null);
				append(ul1, text4);
				append(ul1, li2);
				append(li2, div1);
				append(ul1, text5);

				if (slot_content_default) {
					append(ul1, slot_content_default_before || (slot_content_default_before = createComment()));
					append(ul1, slot_content_default);
					append(ul1, slot_content_default_after || (slot_content_default_after = createComment()));
				}

				append(ul1, text6);
				append(ul1, br0);
				append(ul1, br1);
				append(ul1, br2);
				append(ul1, br3);
				current = true;
			},

			p: function update(changed, ctx) {
				if (ctx.background) {
					if (if_block) {
						if_block.p(changed, ctx);
					} else {
						if_block = create_if_block$e(component, ctx);
						if_block.c();
						if_block.m(ul1, text2);
					}
				} else if (if_block) {
					if_block.d(1);
					if_block = null;
				}

				if ((!current || changed.fixed) && ul1_class_value !== (ul1_class_value = "col s10 m5 l3 sidenav " + (ctx.fixed ? "sidenav-fixed" : ""))) {
					ul1.className = ul1_class_value;
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 2);

				if (i0) i0._fragment.o(outrocallback);
				if (i1) i1._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(nav);
				}

				i0.destroy();
				if (detach) {
					detachNode(text1);
					detachNode(ul1);
				}

				if (if_block) if_block.d();
				i1.destroy();

				if (slot_content_default) {
					reinsertBetween(slot_content_default_before, slot_content_default_after, slot_content_default);
					detachNode(slot_content_default_before);
					detachNode(slot_content_default_after);
				}
			}
		};
	}

	// (10:1) {#if background}
	function create_if_block$e(component, ctx) {
		var li, div1, div0, img, text, br0, br1, br2, br3;

		return {
			c: function create() {
				li = createElement("li");
				div1 = createElement("div");
				div0 = createElement("div");
				img = createElement("img");
				text = createText("\r\n\t\t\t");
				br0 = createElement("br");
				br1 = createElement("br");
				br2 = createElement("br");
				br3 = createElement("br");
				img.id = "cds";
				img.src = ctx.background;
				img.alt = "cds";
				img.width = "200";
				img.height = "200";
				addLoc(img, file$r, 13, 4, 479);
				div0.className = "background";
				addLoc(div0, file$r, 12, 3, 449);
				addLoc(br0, file$r, 15, 3, 562);
				addLoc(br1, file$r, 15, 7, 566);
				addLoc(br2, file$r, 15, 11, 570);
				addLoc(br3, file$r, 15, 15, 574);
				div1.className = "user-view";
				addLoc(div1, file$r, 11, 2, 421);
				addLoc(li, file$r, 10, 1, 413);
			},

			m: function mount(target, anchor) {
				insert(target, li, anchor);
				append(li, div1);
				append(div1, div0);
				append(div0, img);
				append(div1, text);
				append(div1, br0);
				append(div1, br1);
				append(div1, br2);
				append(div1, br3);
			},

			p: function update(changed, ctx) {
				if (changed.background) {
					img.src = ctx.background;
				}
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(li);
				}
			}
		};
	}

	function Sidenav(options) {
		this._debugName = '<Sidenav>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(data$l(), options.data);
		if (!('fixed' in this._state)) console.warn("<Sidenav> was created without expected data property 'fixed'");
		if (!('background' in this._state)) console.warn("<Sidenav> was created without expected data property 'background'");
		this._intro = !!options.intro;

		this._slotted = options.slots || {};

		this._fragment = create_main_fragment$r(this, this._state);

		this.root._oncreate.push(() => {
			oncreate$7.call(this);
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

	assign(Sidenav.prototype, protoDev);

	Sidenav.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	/* ui\panel\App.html generated by Svelte v2.16.1 */




	const utils$1 = {
		DecoupledEditor,
		// to follow redirect after a fetch
		followRedirect(response) {
			if(response.redirected) {
				window.location.href = response.url;
			}
			return response;
		},
		fetch(src, postBody) {
			return (
				fetch(src, postBody ? {
	                    method: "POST",
	                    mode: "same-origin",
	                    credentials: "same-origin",
	                    headers: {
	                        "Content-Type": "application/json"
	                    },
	                    redirect: "follow",
	                    body: JSON.stringify(postBody)
	                } : {
	                    method: "GET",
	                    mode: "same-origin",
	                    credentials: "same-origin",
	                    headers: {
	                        "Content-Type": "application/x-www-form-urlencoded"
	                    },
	                    redirect: "follow",
	                })
				.then(response => {
	                    if(response.redirected) {
	                        window.location.href = response.url;
	                    }
	                    return response;
	                })
	                .then(response => {
	                    var contentType = response.headers.get("content-type");
	                    if(contentType && contentType.includes("application/json")) {
	                        return response.json().then(json => ({status: response.status, body: json.body}));
	                    }
	                    return {status: response.status, body: null};
	                })
			)
		},
		upload(endpoint, inputid) {
			var input = document.getElementById(inputid);
	            var data = new FormData();
			for(var idx in input.files) {
				data.append('file' + idx, input.files[idx]);
			}
			return (
				fetch(endpoint, {
	                    method: "POST",
	                    mode: "same-origin",
	                    credentials: "same-origin",
	                    redirect: "follow",
	                    body: data
	                })
				.then(response => {
	                    if(response.redirected) {
	                        window.location.href = response.url;
	                    }
	                    return response;
	                })
	                .then(response => {
	                    var contentType = response.headers.get("content-type");
	                    if(contentType && contentType.includes("application/json")) {
	                        return response.json().then(json => ({status: response.status, body: json.body}));
	                    }
	                    return {status: response.status, body: null};
	                })
			)
		},
		toast(html) {
			M.toast({ html });
		},
		reload() {
			page.reload();
		}
	};

	function data$m() {
				return {
					currentPage: null,
					getuser:
						utils$1.fetch("/user")
						.then(response => {
							window.cdsuser = response.body;
							return response.body;
						}),
					title: "CDS-PANEL",
					routes: {
						"Security Policy":					{access: [3, 5, 7], icon: "security", page: SecurityPolicy},
						"Access Control Center":			{access: [5, 7], icon: "account_circle", page: AccessControlCenter},
						"Comment Control Center":			{access: [3, 5, 7], icon: "comment", page: CommentControlCenter},
						"Consultation Schedule":			{access: [3, 5, 7], icon: "event", page: ConsultationSchedule},
						"Live Chat":						{access: [5, 7], icon: "chat", page: LiveChat},
						"Forms":							{access: [3, 5, 7], icon: "assignment", page: Forms},
						"Apply Center":						{access: [3, 5, 7], icon: "assignment_ind", page: ApplyCenter},
						// "Portal Control Center":			{access: [5, 7], icon: "account_balance", page: PortalControlCenter},
						// "Reserved Consultations":			{access: [5, 7], icon: "av_timer", page: ReservedConsultations},
						"Content Center":					{access: [3, 5, 7], icon: "subject", page: ContentControlCenter},
						"حساب کاربری":						{access: [2], icon: "security", page: FaSecurityPolicy},		
						"پروسه اپلای" : 		    		{access: [2], icon: "airplanemode_active", page: ApplyProcess},
						// "تراکنش ها و رزرو های انجام شده": {access: [2], icon: "receipt", page: Consultations},	
						"زمان های مشاوره" : 		   	   {access: [2], icon: "event", page: ReservingConsultancyTime},
					}
				};
			}
	var methods$g = {
		// to understand the process of load method see following link
		// https://svelte.technology/guide#understanding-svelte-components
		load(page) {
			const {currentPage, routes} = this.get();
			if(routes[page].access.includes(cdsuser.access)) {
				currentPage && currentPage.destroy();
				const newPage = new routes[page].page({
					target: document.getElementById("workspace"),
					data: {
						message: '' // pass data here
					}
				});
				this.set({currentPage: newPage});
			}
		},
		reload() {
			const {currentPage, routes} = this.get();
			currentPage && currentPage.destroy();
			const newPage = new currentPage.constructor({
				target: document.getElementById("workspace"),
				data: {
					message: '' // pass data here
				}
			});
			this.set({currentPage: newPage});
		}
	};

	function oncreate$8() {
				M.AutoInit();
				window.utils = utils$1;
				window.page = this;
			}
	const file$s = "ui\\panel\\App.html";

	function click_handler$3(event) {
		const { component, ctx } = this._svelte;

		component.load(ctx.r);
	}

	function get_each_context$4(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.r = list[i];
		return child_ctx;
	}

	function create_main_fragment$s(component, ctx) {
		var title_value, text0, div2, await_block_anchor, promise, text1, div1, div0, current;

		document.title = title_value = ctx.title;

		let info = {
			component,
			ctx,
			current: null,
			pending: create_pending_block$8,
			then: create_then_block$8,
			catch: create_catch_block$8,
			value: 'user',
			error: 'err',
			blocks: Array(3)
		};

		handlePromise(promise = ctx.getuser, info);

		var sidenav_initial_data = {
		 	background: "/public/img/cds.png",
		 	fixed: true
		 };
		var sidenav = new Sidenav({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() },
			data: sidenav_initial_data
		});

		return {
			c: function create() {
				text0 = createText("\r\n\r\n");
				div2 = createElement("div");
				await_block_anchor = createComment();

				info.block.c();

				sidenav._fragment.c();
				text1 = createText("\r\n\t");
				div1 = createElement("div");
				div0 = createElement("div");
				div0.className = "container";
				div0.id = "workspace";
				addLoc(div0, file$s, 19, 2, 489);
				div1.className = "col offset-l3";
				addLoc(div1, file$s, 18, 1, 458);
				div2.className = "row";
				addLoc(div2, file$s, 4, 0, 58);
			},

			m: function mount(target, anchor) {
				insert(target, text0, anchor);
				insert(target, div2, anchor);
				append(sidenav._slotted.default, await_block_anchor);

				info.block.i(sidenav._slotted.default, info.anchor = null);
				info.mount = () => await_block_anchor.parentNode;
				info.anchor = await_block_anchor;

				sidenav._mount(div2, null);
				append(div2, text1);
				append(div2, div1);
				append(div1, div0);
				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				if ((!current || changed.title) && title_value !== (title_value = ctx.title)) {
					document.title = title_value;
				}

				info.ctx = ctx;

				if (('getuser' in changed) && promise !== (promise = ctx.getuser) && handlePromise(promise, info)) ; else {
					info.block.p(changed, assign(assign({}, ctx), info.resolved));
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 2);

				const countdown = callAfter(outrocallback, 3);
				for (let i = 0; i < 3; i += 1) {
					const block = info.blocks[i];
					if (block) block.o(countdown);
					else countdown();
				}

				if (sidenav) sidenav._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(text0);
					detachNode(div2);
				}

				info.block.d();
				info = null;

				sidenav.destroy();
			}
		};
	}

	// (15:2) {:catch err}
	function create_catch_block$8(component, ctx) {
		var p, text0, text1_value = ctx.err.code, text1, current;

		return {
			c: function create() {
				p = createElement("p");
				text0 = createText("Error ");
				text1 = createText(text1_value);
				addLoc(p, file$s, 15, 3, 407);
			},

			m: function mount(target, anchor) {
				insert(target, p, anchor);
				append(p, text0);
				append(p, text1);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((changed.getuser) && text1_value !== (text1_value = ctx.err.code)) {
					setData(text1, text1_value);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: run,

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(p);
				}
			}
		};
	}

	// (9:2) {:then user}
	function create_then_block$8(component, ctx) {
		var each_anchor, current;

		var each_value = ctx.Object.keys(ctx.routes);

		var each_blocks = [];

		for (var i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block$4(component, get_each_context$4(ctx, each_value, i));
		}

		function outroBlock(i, detach, fn) {
			if (each_blocks[i]) {
				each_blocks[i].o(() => {
					if (detach) {
						each_blocks[i].d(detach);
						each_blocks[i] = null;
					}
					if (fn) fn();
				});
			}
		}

		return {
			c: function create() {
				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				each_anchor = createComment();
			},

			m: function mount(target, anchor) {
				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].i(target, anchor);
				}

				insert(target, each_anchor, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				if (changed.routes || changed.Object || changed.getuser) {
					each_value = ctx.Object.keys(ctx.routes);

					for (var i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context$4(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block$4(component, child_ctx);
							each_blocks[i].c();
						}
						each_blocks[i].i(each_anchor.parentNode, each_anchor);
					}
					for (; i < each_blocks.length; i += 1) outroBlock(i, 1);
				}
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				each_blocks = each_blocks.filter(Boolean);
				const countdown = callAfter(outrocallback, each_blocks.length);
				for (let i = 0; i < each_blocks.length; i += 1) outroBlock(i, 0, countdown);

				current = false;
			},

			d: function destroy$$1(detach) {
				destroyEach(each_blocks, detach);

				if (detach) {
					detachNode(each_anchor);
				}
			}
		};
	}

	// (11:4) {#if routes[r].access.includes(user.access)}
	function create_if_block$f(component, ctx) {
		var li, a, text0_value = ctx.routes[ctx.r].icon, text0, text1_value = ctx.r, text1, current;

		var i = new Icon({
			root: component.root,
			store: component.store,
			slots: { default: createFragment() }
		});

		return {
			c: function create() {
				li = createElement("li");
				a = createElement("a");
				text0 = createText(text0_value);
				i._fragment.c();
				text1 = createText(text1_value);
				a._svelte = { component, ctx };

				addListener(a, "click", click_handler$3);
				a.className = "truncate";
				a.href = "#!";
				addLoc(a, file$s, 11, 9, 281);
				addLoc(li, file$s, 11, 5, 277);
			},

			m: function mount(target, anchor) {
				insert(target, li, anchor);
				append(li, a);
				append(i._slotted.default, text0);
				i._mount(a, null);
				append(a, text1);
				current = true;
			},

			p: function update(changed, _ctx) {
				ctx = _ctx;
				if ((!current || changed.routes || changed.Object) && text0_value !== (text0_value = ctx.routes[ctx.r].icon)) {
					setData(text0, text0_value);
				}

				if ((!current || changed.Object || changed.routes) && text1_value !== (text1_value = ctx.r)) {
					setData(text1, text1_value);
				}

				a._svelte.ctx = ctx;
			},

			i: function intro(target, anchor) {
				if (current) return;

				this.m(target, anchor);
			},

			o: function outro(outrocallback) {
				if (!current) return;

				if (i) i._fragment.o(outrocallback);
				current = false;
			},

			d: function destroy$$1(detach) {
				if (detach) {
					detachNode(li);
				}

				i.destroy();
				removeListener(a, "click", click_handler$3);
			}
		};
	}

	// (10:3) {#each Object.keys(routes) as r}
	function create_each_block$4(component, ctx) {
		var if_block_anchor, current;

		var if_block = (ctx.routes[ctx.r].access.includes(ctx.user.access)) && create_if_block$f(component, ctx);

		return {
			c: function create() {
				if (if_block) if_block.c();
				if_block_anchor = createComment();
			},

			m: function mount(target, anchor) {
				if (if_block) if_block.m(target, anchor);
				insert(target, if_block_anchor, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				if (ctx.routes[ctx.r].access.includes(ctx.user.access)) {
					if (if_block) {
						if_block.p(changed, ctx);
					} else {
						if_block = create_if_block$f(component, ctx);
						if (if_block) if_block.c();
					}

					if_block.i(if_block_anchor.parentNode, if_block_anchor);
				} else if (if_block) {
					if_block.o(function() {
						if_block.d(1);
						if_block = null;
					});
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
				if (if_block) if_block.d(detach);
				if (detach) {
					detachNode(if_block_anchor);
				}
			}
		};
	}

	// (7:18)      <Loading small/>    {:then user}
	function create_pending_block$8(component, ctx) {
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

	function App(options) {
		this._debugName = '<App>';
		if (!options || (!options.target && !options.root)) {
			throw new Error("'target' is a required option");
		}

		init(this, options);
		this._state = assign(assign({ Object : Object }, data$m()), options.data);
		if (!('title' in this._state)) console.warn("<App> was created without expected data property 'title'");
		if (!('getuser' in this._state)) console.warn("<App> was created without expected data property 'getuser'");

		if (!('routes' in this._state)) console.warn("<App> was created without expected data property 'routes'");
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$s(this, this._state);

		this.root._oncreate.push(() => {
			oncreate$8.call(this);
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
	assign(App.prototype, methods$g);

	App.prototype._checkReadOnly = function _checkReadOnly(newState) {
	};

	const app = new App({
		target: document.body
		// data: {
		// 	name: 'azizi'
		// }
	});

	return app;

}());
//# sourceMappingURL=bundle.js.map

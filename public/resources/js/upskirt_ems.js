// "use strict";

// Capture the output of this into a variable, if you want
//(function(Module, args) {
//  Module = Module || {};
//  args = args || [];

// Runs much faster, for some reason
this['Module'] = {};
var args = arguments;
  
// === Auto-generated preamble library stuff ===

//========================================
// Runtime code shared with compiler
//========================================

var Runtime = {
  stackAlloc: function stackAlloc(size) { var ret = STACKTOP; assert(size > 0, "Trying to allocate 0"); _memset(STACKTOP, 0, size); STACKTOP += size;STACKTOP = Math.ceil(STACKTOP/4)*4;; assert(STACKTOP < STACK_ROOT + STACK_MAX, "Ran out of stack"); return ret; },
  staticAlloc: function staticAlloc(size) { var ret = STATICTOP; assert(size > 0, "Trying to allocate 0"); STATICTOP += size;STATICTOP = Math.ceil(STATICTOP/4)*4;; return ret; },
  alignMemory: function alignMemory(size,quantum) { var ret = size = Math.ceil(size/(quantum ? quantum : 4))*(quantum ? quantum : 4);; return ret; },
  isNumberType: function (type) {
    return type in Runtime.INT_TYPES || type in Runtime.FLOAT_TYPES;
  },
  isPointerType: function isPointerType(type) {
  return pointingLevels(type) > 0;
},
  isStructType: function isStructType(type) {
  if (isPointerType(type)) return false;
  if (new RegExp(/^\[\d+\ x\ (.*)\]/g).test(type)) return true; // [15 x ?] blocks. Like structs
  // See comment in isStructPointerType()
  return !Runtime.isNumberType(type) && type[0] == '%';
},
  INT_TYPES: {"i1":0,"i8":0,"i16":0,"i32":0,"i64":0},
  FLOAT_TYPES: {"float":0,"double":0},
  getNativeFieldSize: function getNativeFieldSize(field, alone) {
  if (4 == 1) return 1;
  var size = {
    '_i1': 1,
    '_i8': 1,
    '_i16': 2,
    '_i32': 4,
    '_i64': 8,
    "_float": 4,
    "_double": 8
  }['_'+field]; // add '_' since float&double confuse closure compiler as keys
  if (!size) {
    size = 4; // A pointer
  }
  if (!alone) size = Math.max(size, 4);
  return size;
},
  dedup: function dedup(items, ident) {
  var seen = {};
  if (ident) {
    return items.filter(function(item) {
      if (seen[item[ident]]) return false;
      seen[item[ident]] = true;
      return true;
    });
  } else {
    return items.filter(function(item) {
      if (seen[item]) return false;
      seen[item] = true;
      return true;
    });
  }
},
  set: function set() {
  var args = typeof arguments[0] === 'object' ? arguments[0] : arguments;
  var ret = {};
  for (var i = 0; i < args.length; i++) {
    ret[args[i]] = 0;
  }
  return ret;
},
  calculateStructAlignment: function calculateStructAlignment(type) {
    type.flatSize = 0;
    type.alignSize = 0;
    var diffs = [];
    var prev = -1;
    type.flatIndexes = type.fields.map(function(field) {
      var size, alignSize;
      if (Runtime.isNumberType(field) || Runtime.isPointerType(field)) {
        size = Runtime.getNativeFieldSize(field, true); // pack char; char; in structs, also char[X]s.
        alignSize = size;
      } else if (Runtime.isStructType(field)) {
        size = Types.types[field].flatSize;
        alignSize = Types.types[field].alignSize;
      } else {
        dprint('Unclear type in struct: ' + field + ', in ' + type.name_);
        assert(0);
      }
      alignSize = type.packed ? 1 : Math.min(alignSize, 4);
      type.alignSize = Math.max(type.alignSize, alignSize);
      var curr = Runtime.alignMemory(type.flatSize, alignSize); // if necessary, place this on aligned memory
      type.flatSize = curr + size;
      if (prev >= 0) {
        diffs.push(curr-prev);
      }
      prev = curr;
      return curr;
    });
    type.flatSize = Runtime.alignMemory(type.flatSize, type.alignSize);
    if (diffs.length == 0) {
      type.flatFactor = type.flatSize;
    } else if (Runtime.dedup(diffs).length == 1) {
      type.flatFactor = diffs[0];
    }
    type.needsFlattening = (type.flatFactor != 1);
    return type.flatIndexes;
  },
  __dummy__: 0
}



var CorrectionsMonitor = {
  MAX_ALLOWED: 0, // Infinity,
  corrections: 0,
  sigs: {},

  note: function(type) {
    var sig = type + '|' + new Error().stack;
    if (!this.sigs[sig]) {
      print('Correction: ' + sig);
      this.sigs[sig] = 0;
    }
    this.sigs[sig]++;
    this.corrections++;
    if (this.corrections >= this.MAX_ALLOWED) abort('\n\nToo many corrections!');
  }
};

function cRound(x) {
  return x >= 0 ? Math.floor(x) : Math.ceil(x);
}




//========================================
// Runtime essentials
//========================================

function __globalConstructor__() {
}

var __THREW__ = false; // Used in checking for thrown exceptions.

var __ATEXIT__ = [];

var ABORT = false;

var undef = 0;

function abort(text) {
  print(text + ':\n' + (new Error).stack);
  ABORT = true;
  throw "Assertion: " + text;
}

function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

// Creates a pointer for a certain slab and a certain address in that slab.
// If just a slab is given, will allocate room for it and copy it there. In
// other words, do whatever is necessary in order to return a pointer, that
// points to the slab (and possibly position) we are given.

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed

function Pointer_make(slab, pos, allocator) {
  pos = pos ? pos : 0;
  assert(pos === 0); // TODO: remove 'pos'
  if (slab === HEAP) return pos;
  var size = slab.length;

  var i;
  for (i = 0; i < size; i++) {
    if (slab[i] === undefined) {
      throw 'Invalid element in slab at ' + new Error().stack; // This can be caught, and you can try again to allocate later, see globalFuncs in run()
    }
  }

  // Finalize
  var ret = [_malloc, Runtime.stackAlloc, Runtime.staticAlloc][allocator ? allocator : ALLOC_STATIC](Math.max(size, 1));

  for (i = 0; i < size; i++) {
    var curr = slab[i];

    if (typeof curr === 'function') {
      curr = Runtime.getFunctionIndex(curr);
    }

    HEAP[ret+i]=curr;
  }

  return ret;
}
Module['Pointer_make'] = Pointer_make;

function Pointer_stringify(ptr) {
  var ret = "";
  var i = 0;
  var t;
  while (1) {
    t = String.fromCharCode(HEAP[ptr+i]);
    if (t == "\0") { break; } else {}
    ret += t;
    i += 1;
  }
  return ret;
}

// Memory management

var PAGE_SIZE = 4096;
function alignMemoryPage(x) {
  return Math.ceil(x/PAGE_SIZE)*PAGE_SIZE;
}

var HEAP, IHEAP, FHEAP;
var STACK_ROOT, STACKTOP, STACK_MAX;
var STATICTOP;

var HAS_TYPED_ARRAYS = false;
var TOTAL_MEMORY = 50*1024*1024;

function __initializeRuntime__() {
  {
    // Without this optimization, Chrome is slow. Sadly, the constant here needs to be tweaked depending on the code being run...
    var FAST_MEMORY = TOTAL_MEMORY/32;
    IHEAP = FHEAP = HEAP = new Array(FAST_MEMORY);
    for (var i = 0; i < FAST_MEMORY; i++) {
      IHEAP[i] = FHEAP[i] = 0; // We do *not* use HEAP[i]=0; here, since this is done just to optimize runtime speed
    }
  }

  var base = intArrayFromString('(null)'); // So printing %s of NULL gives '(null)'
                                           // Also this ensures we leave 0 as an invalid address, 'NULL'
  for (var i = 0; i < base.length; i++) {
    HEAP[i]=base[i];
  }

  Module['HEAP'] = HEAP;
  Module['IHEAP'] = IHEAP;
  Module['FHEAP'] = FHEAP;

  STACK_ROOT = STACKTOP = alignMemoryPage(10);
  var TOTAL_STACK = 1024*1024; // XXX: Changing this value can lead to bad perf on v8!
  STACK_MAX = STACK_ROOT + TOTAL_STACK;

  STATICTOP = alignMemoryPage(STACK_MAX);
}

function __shutdownRuntime__() {
  while( __ATEXIT__.length > 0) {
    var func = __ATEXIT__.pop();
    if (typeof func === 'number') {
      func = FUNCTION_TABLE[func];
    }
    func();
  }
}


// Copies a list of num items on the HEAP into a
// a normal JavaScript array of numbers
function Array_copy(ptr, num) {
  // TODO: In the SAFE_HEAP case, do some reading here, for debugging purposes - currently this is an 'unnoticed read'.
  {
    return IHEAP.slice(ptr, ptr+num);
  }
}

function String_len(ptr) {
  var i = 0;
  while (HEAP[ptr+i]) i++; // Note: should be |!= 0|, technically. But this helps catch bugs with undefineds
  return i;
}

// Copies a C-style string, terminated by a zero, from the HEAP into
// a normal JavaScript array of numbers
function String_copy(ptr, addZero) {
  var len = String_len(ptr);
  if (addZero) len++;
  var ret = Array_copy(ptr, len);
  if (addZero) ret[len-1] = 0;
  return ret;
}

// Tools

var PRINTBUFFER = '';
function __print__(text) {
  if (text === null) {
    // Flush
    print(PRINTBUFFER);
    PRINTBUFFER = '';
    return;
  }
  // We print only when we see a '\n', as console JS engines always add
  // one anyhow.
  PRINTBUFFER = PRINTBUFFER + text;
  var endIndex;
  while ((endIndex = PRINTBUFFER.indexOf('\n')) != -1) {
    print(PRINTBUFFER.substr(0, endIndex));
    PRINTBUFFER = PRINTBUFFER.substr(endIndex + 1);
  }
}

function jrint(label, obj) { // XXX manual debugging
  if (!obj) {
    obj = label;
    label = '';
  } else
    label = label + ' : ';
  print(label + JSON.stringify(obj));
}

// This processes a JS string into a C-line array of numbers, 0-terminated.
// For LLVM-originating strings, see parser.js:parseLLVMString function
function intArrayFromString(stringy) {
  var ret = [];
  var t;
  var i = 0;
  while (i < stringy.length) {
    ret.push(stringy.charCodeAt(i));
    i = i + 1;
  }
  ret.push(0);
  return ret;
}
Module['intArrayFromString'] = intArrayFromString;

function intArrayToString(array) {
  var ret = '';
  for (var i = 0; i < array.length; i++) {
    ret += String.fromCharCode(array[i]);
  }
  return ret;
}

var unSign = function unSign(value, bits, ignore) {
  if (value >= 0) return value;
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
  // TODO: clean up previous line
}
var reSign = function reSign(value, bits, ignore) {
  if (value <= 0) return value;
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half) {
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}

// === Body ===



var $0___SIZE = 16; // %0
  
var $1___SIZE = 8; // %1
  
var $2___SIZE = 3164; // %2
  var $2___FLATTENER = [0,8,40,44,48,52,1076,2100,3124,3132,3140,3148,3152,3156,3160];
var $3___SIZE = 20; // %3
  
var $4___SIZE = 16; // %4
  
var $enum_mkd_autolink___SIZE = 4; // %enum.mkd_autolink
  
var $struct_anon___SIZE = 8; // %struct.anon
  
var $struct_array___SIZE = 16; // %struct.array
  
var $struct_buf___SIZE = 20; // %struct.buf
  
var $struct_html_tag___SIZE = 8; // %struct.html_tag
  
var $struct_link_ref___SIZE = 12; // %struct.link_ref
  
var $struct_mkd_renderer___SIZE = 100; // %struct.mkd_renderer
  
var $struct_parray___SIZE = 12; // %struct.parray
  
var $struct_render___SIZE = 1160; // %struct.render
  var $struct_render___FLATTENER = [0,100,116,1140,1152,1156];
var $struct_xhtml_renderopt___SIZE = 12; // %struct.xhtml_renderopt
  
var _is_safe_link_valid_uris_count;
var _is_safe_link_valid_uris;
var __str;
var __str1;
var __str2;
var __str3;
var ___func___ups_markdown;
var __str4;
var __str5;
var __DefaultRuneLocale;
var _block_tags;
var __str6;
var __str7;
var __str8;
var __str9;
var __str10;
var __str11;
var __str12;
var __str13;
var __str14;
var __str15;
var __str16;
var __str17;
var __str18;
var __str19;
var __str20;
var __str21;
var __str22;
var __str23;
var __str24;
var __str25;
var __str26;
var __str27;
var _ups_toc_renderer_toc_render;
var _ups_xhtml_renderer_renderer_default;
var _smartypants_subs;
var __str28;
var __str129;
var __str230;
var __str331;
var __str432;
var __str533;
var __str634;
var __str735;
var __str836;
var __str937;
var __str1038;
var __str1139;
var __str1240;
var __str1341;
var __str1442;
var __str1543;
var __str1644;
var __str1745;
var __str1846;
var __str1947;
var __str2048;
var __str2149;
var __str2250;
var __str2351;
var __str2452;
var __str2553;
var __str2654;
var __str2755;
var __str2856;
var __str29;
var __str30;
var __str31;
var __str32;
var __str33;
var __str34;
var __str35;
var __str36;
var __str37;
var __str38;
var __str39;
var __str40;
var __str41;
var __str42;
var __str43;
var __str44;
var __str45;
var __str46;
var __str47;
var __str48;
var __str49;
var __str50;
var __str51;
var __str52;
var __str53;
var __str54;
var __str55;
var __str56;
var __str57;
var __str58;
var __str59;
var __str60;
var __str61;
var __str62;
var __str63;
var __str64;
var __str65;
var __str66;
var __str67;
var __str68;
var __str69;
var __str70;
var __str71;
var __str72;
var __str73;
var __str74;
var __str75;
var __str76;
var __str77;
var __str78;
var __str79;
var __str80;
var __str81;
var __str82;
var __str83;
var __str84;
var __str85;
var __str86;
var __str87;
var __str88;
var __str89;
var _strlen=function _strlen (ptr) {
      return String_len(ptr);
    }
var _memcmp=function _memcmp (p1, p2, num) {
      for (var i = 0; i < num; i++) {
        var v1 = HEAP[p1+i];
        var v2 = HEAP[p2+i];
        if (v1 != v2) return v1 > v2 ? 1 : -1;
      }
      return 0;
    }
var _llvm_memcpy_p0i8_p0i8_i32=function (dest, src, num, idunno) {
      var curr;
      for (var i = 0; i < num; i++) {
        // TODO: optimize for the typed arrays case
        // || 0, since memcpy sometimes copies uninitialized areas XXX: Investigate why initializing alloc'ed memory does not fix that too
        IHEAP[dest+i] = IHEAP[src+i]; FHEAP[dest+i] = FHEAP[src+i]; ;
      }
    }
  var _undefined=undefined
var _qsort=function _qsort (base, num, size, comparator) {
      // forward calls to the JavaScript sort method
      // first, sort the items logically
      comparator = FUNCTION_TABLE[comparator];
      var keys = [];
      for (var i = 0; i < num; i++) keys.push(i);
      keys.sort(function(a, b) {
        return comparator(base+a*size, base+b*size);
      });
      // apply the sort
      var temp = _malloc(num*size);
      _memcpy(temp, base, num*size);
      for (var i = 0; i < num; i++) {
        if (keys[i] == i) continue; // already in place
        _memcpy(base+i*size, temp+keys[i]*size, size);
      }
      _free(temp);
    }
  var _memcpy=function _memcpy (dest, src, num, idunno) {
      var curr;
      for (var i = 0; i < num; i++) {
        // TODO: optimize for the typed arrays case
        // || 0, since memcpy sometimes copies uninitialized areas XXX: Investigate why initializing alloc'ed memory does not fix that too
        IHEAP[dest+i] = IHEAP[src+i]; FHEAP[dest+i] = FHEAP[src+i]; ;
      }
    }
// stub for ___assert_rtn
var _llvm_memset_p0i8_i32=function (ptr, value, num) {
      for (var i = 0; i < num; i++) {
        HEAP[ptr+i]=value;
      }
    }
  
var _llvm_memmove_p0i8_p0i8_i32=function (dest, src, num, idunno) {
      // not optimized!
      if (num === 0) return; // will confuse malloc if 0
      var tmp = _malloc(num);
      _memcpy(tmp, src, num);
      _memcpy(dest, tmp, num);
      _free(tmp);
    }
  
var _free=function _free (){}
// stub for ___maskrune
var _calloc=function _calloc (n, s) {
      var ret = _malloc(n*s);
      _memset(ret, 0, n*s);
      return ret;
    }
  var _malloc=function staticAlloc(size) { var ret = STATICTOP; assert(size > 0, "Trying to allocate 0"); STATICTOP += size;STATICTOP = Math.ceil(STATICTOP/4)*4;; return ret; }
var _strncasecmp=function _strncasecmp (px, py, n) {
      var i = 0;
      while (i < n) {
        var x = _tolower(HEAP[px+i]);
        var y = _tolower(HEAP[py+i]);
        if (x == y && x == 0) return 0;
        if (x == 0) return -1;
        if (y == 0) return 1;
        if (x == y) {
          i ++;
          continue;
        } else {
          return x > y ? 1 : -1;
        }
      }
      return 0;
    }
  
// stub for _bsearch
var _realloc=function _realloc (ptr, size) {
      // Very simple, inefficient implementation - if you use a real malloc, best to use
      // a real realloc with it
      if (!size) {
        if (ptr) _free(ptr);
        return 0;
      }
      var ret = _malloc(size);
      if (ptr) {
        _memcpy(ret, ptr, size); // might be some invalid reads
        _free(ptr);
      }
      return ret;
    }
  
var _strncmp=function _strncmp (px, py, n) {
      var i = 0;
      while (i < n) {
        var x = HEAP[px+i];
        var y = HEAP[py+i];
        if (x == y && x == 0) return 0;
        if (x == 0) return -1;
        if (y == 0) return 1;
        if (x == y) {
          i ++;
          continue;
        } else {
          return x > y ? 1 : -1;
        }
      }
      return 0;
    }

// stub for _llvm_va_start
// stub for _llvm_va_end
var _llvm_va_copy=function _llvm_va_copy (ppdest, ppsrc) {
      IHEAP[ppdest+0] = IHEAP[ppsrc+0]; FHEAP[ppdest+0] = FHEAP[ppsrc+0]; 
      /* Alternate implementation that copies the actual DATA; it assumes the va_list is prefixed by its size
      var psrc = IHEAP[ppsrc]-1;
      var num = IHEAP[psrc]; // right before the data, is the number of (flattened) values
      var pdest = _malloc(num+1);
      _memcpy(pdest, psrc, num+1);
      IHEAP[ppdest] = pdest+1;
      */
    }
var _vsnprintf=function _vsnprintf (dst, num, src, ptr) {
      var text = __formatString(-src, ptr); // |-|src tells formatstring to use C-style params (typically they are from varargs)
      var i;
      for (i = 0; i < num; i++) {
        HEAP[dst+i]=HEAP[text+i];
        if (HEAP[dst+i] == 0) break;
      }
      return i; // Actually, should return how many *would* have been written, if the |num| had not stopped us.
    }
  var __formatString=function __formatString () {
      function isFloatArg(type) {
        return String.fromCharCode(type) in Runtime.set('f', 'e', 'g');
      }
      var cStyle = false;
      var textIndex = arguments[0];
      var argIndex = 1;
      if (textIndex < 0) {
        cStyle = true;
        textIndex = -textIndex;
        argIndex = arguments[1];
      } else {
        var _arguments = arguments;
      }
      function getNextArg(type) {
        var ret;
        if (!cStyle) {
          ret = _arguments[argIndex];
          argIndex++;
        } else {
          if (isFloatArg(type)) {
            ret = HEAP[argIndex];
          } else {
            ret = HEAP[argIndex];
          }
          argIndex += type === 'l'.charCodeAt(0) ? 8 : 4; // XXX hardcoded native sizes
        }
        return ret;
      }
  
      var ret = [];
      var curr, next, currArg;
      while(1) {
        curr = HEAP[textIndex];
        if (curr === 0) break;
        next = HEAP[textIndex+1];
        if (curr == '%'.charCodeAt(0)) {
          // Handle very very simply formatting, namely only %.X[f|d|u|etc.]
          var precision = -1;
          if (next == '.'.charCodeAt(0)) {
            textIndex++;
            precision = 0;
            while(1) {
              var precisionChr = HEAP[textIndex+1];
              if (!(precisionChr >= '0'.charCodeAt(0) && precisionChr <= '9'.charCodeAt(0))) break;
              precision *= 10;
              precision += precisionChr - '0'.charCodeAt(0);
              textIndex++;
            }
            next = HEAP[textIndex+1];
          }
          if (next == 'l'.charCodeAt(0)) {
            textIndex++;
            next = HEAP[textIndex+1];
          }
          if (isFloatArg(next)) {
            next = 'f'.charCodeAt(0); // no support for 'e'
          }
          if (['d', 'i', 'u', 'p', 'f'].indexOf(String.fromCharCode(next)) != -1) {
            var currArg;
            var argText;
            currArg = getNextArg(next);
            argText = String(+currArg); // +: boolean=>int
            if (next == 'u'.charCodeAt(0)) {
              argText = String(unSign(currArg, 32));
            } else if (next == 'p'.charCodeAt(0)) {
              argText = '0x' + currArg.toString(16);
            } else {
              argText = String(+currArg); // +: boolean=>int
            }
            if (precision >= 0) {
              if (isFloatArg(next)) {
                var dotIndex = argText.indexOf('.');
                if (dotIndex == -1 && next == 'f'.charCodeAt(0)) {
                  dotIndex = argText.length;
                  argText += '.';
                }
                argText += '00000000000'; // padding
                argText = argText.substr(0, dotIndex+1+precision);
              } else {
                while (argText.length < precision) {
                  argText = '0' + argText;
                }
              }
            }
            argText.split('').forEach(function(chr) {
              ret.push(chr.charCodeAt(0));
            });
            textIndex += 2;
          } else if (next == 's'.charCodeAt(0)) {
            ret = ret.concat(String_copy(getNextArg(next)));
            textIndex += 2;
          } else if (next == 'c'.charCodeAt(0)) {
            ret = ret.concat(getNextArg(next));
            textIndex += 2;
          } else {
            ret.push(next);
            textIndex += 2; // not sure what to do with this %, so print it
          }
        } else {
          ret.push(curr);
          textIndex += 1;
        }
      }
      return Pointer_make(ret.concat(0), 0, ALLOC_STACK); // NB: Stored on the stack
      //var len = ret.length+1;
      //var ret = Pointer_make(ret.concat(0), 0, ALLOC_STACK); // NB: Stored on the stack
      //STACKTOP -= len; // XXX horrible hack. we rewind the stack, to 'undo' the alloc we just did.
      //                 // the point is that this works if nothing else allocs on the stack before
      //                 // the string is read, which should be true - it is very transient, see the *printf* functions below.
      //return ret;
    }
  var _STDIO={"streams":{},"filenames":{},"counter":1,"SEEK_SET":0,"SEEK_CUR":1,"SEEK_END":2, init: function () {
        try {
          _stdin = Pointer_make([0], null, ALLOC_STATIC);
          IHEAP[_stdin] = this.prepare('<<stdin>>');
        } catch(e){} // stdin/out/err may not exist if not needed
        try {
          _stdout = Pointer_make([0], null, ALLOC_STATIC);
          IHEAP[_stdout] = this.prepare('<<stdout>>', null, true);
        } catch(e){}
        try {
          _stderr = Pointer_make([0], null, ALLOC_STATIC);
          IHEAP[_stderr] = this.prepare('<<stderr>>', null, true);
        } catch(e){}
      }, prepare: function (filename, data, print_) {
        var stream = this.counter++;
        this.streams[stream] = {
          filename: filename,
          data: data ? data : [],
          position: 0,
          eof: 0,
          error: 0,
          print: print_ // true for stdout and stderr - we print when receiving data for them
        };
        this.filenames[filename] = stream;
        return stream;
      }, open: function (filename) {
        var stream = _STDIO.filenames[filename];
        if (!stream) return -1; // assert(false, 'No information for file: ' + filename);
        var info = _STDIO.streams[stream];
        info.position = info.error = info.eof = 0;
        return stream;
      }, read: function (stream, ptr, size) {
        var info = _STDIO.streams[stream];
        if (!info) return -1;
        for (var i = 0; i < size; i++) {
          if (info.position >= info.data.length) {
            info.eof = 1;
            return 0; // EOF
          }
          HEAP[ptr]=info.data[info.position];
          info.position++;
          ptr++;
        }
        return size;
      }, write: function (stream, ptr, size) {
        var info = _STDIO.streams[stream];
        if (!info) return -1;
        if (info.print) {
          __print__(intArrayToString(Array_copy(ptr, size)));
        } else {
          for (var i = 0; i < size; i++) {
            info.data[info.position] = HEAP[ptr];
            info.position++;
            ptr++;
          }
        }
        return size;
      } }
var _snprintf=function _snprintf () {
      var str = arguments[0];
      var num = arguments[1];
      var args = Array.prototype.slice.call(arguments, 2);
      _strncpy(str, __formatString.apply(null, args), num); // not terribly efficient
    }
  var _strncpy=function _strncpy (pdest, psrc, num) {
      var padding = false, curr;
      for (var i = 0; i < num; i++) {
        curr = padding ? 0 : HEAP[psrc+i];
        HEAP[pdest+i]=curr;
        padding = padding || HEAP[psrc+i] == 0;
      }
    }
  
// stub for ___tolower
var _memset=function _memset (ptr, value, num) {
      for (var i = 0; i < num; i++) {
        HEAP[ptr+i]=value;
      }
    }



  function _is_safe_link($link, $link_len) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 20);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $i=__stackBase__+12;
        var $len=__stackBase__+16;
        HEAP[$2]=$link;
        HEAP[$3]=$link_len;
        HEAP[$i]=0;
        __label__ = 0; break;
      case 0: // $4
        var $5=HEAP[$i];
        var $6=unSign(($5), 32, 0) < 4;
        if ($6) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $7
        var $8=HEAP[$i];
        var $9=(_is_safe_link_valid_uris+$8*4)&4294967295;
        var $10=HEAP[$9];
        var $11=_strlen($10);
        HEAP[$len]=$11;
        var $12=HEAP[$3];
        var $13=HEAP[$len];
        var $14=unSign(($12), 32, 0) > unSign(($13), 32, 0);
        if ($14) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $15
        var $16=HEAP[$2];
        var $17=HEAP[$i];
        var $18=(_is_safe_link_valid_uris+$17*4)&4294967295;
        var $19=HEAP[$18];
        var $20=HEAP[$len];
        var $21=_memcmp($16, $19, $20);
        var $22=((($21))|0)==0;
        if ($22) { __label__ = 5; break; } else { __label__ = 4; break; }
      case 5: // $23
        HEAP[$1]=1;
        __label__ = 6; break;
      case 4: // $24
        __label__ = 7; break;
      case 7: // $25
        var $26=HEAP[$i];
        var $27=(($26) + 1)&4294967295;
        HEAP[$i]=$27;
        __label__ = 0; break;
      case 2: // $28
        HEAP[$1]=0;
        __label__ = 6; break;
      case 6: // $29
        var $30=HEAP[$1];
        STACKTOP = __stackBase__;
        return $30;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _ups_markdown($ob, $ib, $rndrer, $extensions) {
    var __stackBase__  = STACKTOP; STACKTOP += 1196; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 1196);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $lr=__stackBase__+16;
        var $text=__stackBase__+20;
        var $i=__stackBase__+24;
        var $beg=__stackBase__+28;
        var $end=__stackBase__+32;
        var $rndr=__stackBase__+36;
        HEAP[$1]=$ob;
        HEAP[$2]=$ib;
        HEAP[$3]=$rndrer;
        HEAP[$4]=$extensions;
        var $5=_bufnew(64);
        HEAP[$text]=$5;
        var $6=HEAP[$3];
        var $7=($6)!=0;
        if ($7) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $8
        __label__ = 2; break;
      case 0: // $9
        var $10=($rndr)&4294967295;
        var $11=HEAP[$3];
        var $12=$10;
        var $13=$11;
        _llvm_memcpy_p0i8_p0i8_i32($12, $13, 100, 4, 0);
        var $14=($rndr+100)&4294967295;
        _arr_init($14, 12);
        var $15=($rndr+1140)&4294967295;
        _parr_init($15);
        HEAP[$i]=0;
        __label__ = 3; break;
      case 3: // $16
        var $17=HEAP[$i];
        var $18=unSign(($17), 32, 0) < 256;
        if ($18) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $19
        var $20=HEAP[$i];
        var $21=($rndr+116)&4294967295;
        var $22=($21+$20*4)&4294967295;
        HEAP[$22]=0;
        __label__ = 6; break;
      case 6: // $23
        var $24=HEAP[$i];
        var $25=(($24) + 1)&4294967295;
        HEAP[$i]=$25;
        __label__ = 3; break;
      case 5: // $26
        var $27=($rndr)&4294967295;
        var $28=($27+56)&4294967295;
        var $29=HEAP[$28];
        var $30=($29)!=0;
        if ($30) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 8: // $31
        var $32=($rndr)&4294967295;
        var $33=($32+52)&4294967295;
        var $34=HEAP[$33];
        var $35=($34)!=0;
        if ($35) { __label__ = 7; break; } else { __label__ = 9; break; }
      case 9: // $36
        var $37=($rndr)&4294967295;
        var $38=($37+76)&4294967295;
        var $39=HEAP[$38];
        var $40=($39)!=0;
        if ($40) { __label__ = 7; break; } else { __label__ = 10; break; }
      case 7: // $41
        var $42=($rndr+116)&4294967295;
        var $43=($42+168)&4294967295;
        HEAP[$43]=2;
        var $44=($rndr+116)&4294967295;
        var $45=($44+380)&4294967295;
        HEAP[$45]=2;
        var $46=HEAP[$4];
        var $47=($46) & 16;
        var $48=((($47))|0)!=0;
        if ($48) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $49
        var $50=($rndr+116)&4294967295;
        var $51=($50+504)&4294967295;
        HEAP[$51]=2;
        __label__ = 12; break;
      case 12: // $52
        __label__ = 10; break;
      case 10: // $53
        var $54=($rndr)&4294967295;
        var $55=($54+48)&4294967295;
        var $56=HEAP[$55];
        var $57=($56)!=0;
        if ($57) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $58
        var $59=($rndr+116)&4294967295;
        var $60=($59+384)&4294967295;
        HEAP[$60]=4;
        __label__ = 14; break;
      case 14: // $61
        var $62=($rndr)&4294967295;
        var $63=($62+64)&4294967295;
        var $64=HEAP[$63];
        var $65=($64)!=0;
        if ($65) { __label__ = 15; break; } else { __label__ = 16; break; }
      case 15: // $66
        var $67=($rndr+116)&4294967295;
        var $68=($67+40)&4294967295;
        HEAP[$68]=6;
        __label__ = 16; break;
      case 16: // $69
        var $70=($rndr)&4294967295;
        var $71=($70+60)&4294967295;
        var $72=HEAP[$71];
        var $73=($72)!=0;
        if ($73) { __label__ = 17; break; } else { __label__ = 18; break; }
      case 18: // $74
        var $75=($rndr)&4294967295;
        var $76=($75+68)&4294967295;
        var $77=HEAP[$76];
        var $78=($77)!=0;
        if ($78) { __label__ = 17; break; } else { __label__ = 19; break; }
      case 17: // $79
        var $80=($rndr+116)&4294967295;
        var $81=($80+364)&4294967295;
        HEAP[$81]=8;
        __label__ = 19; break;
      case 19: // $82
        var $83=($rndr+116)&4294967295;
        var $84=($83+240)&4294967295;
        HEAP[$84]=10;
        var $85=($rndr+116)&4294967295;
        var $86=($85+368)&4294967295;
        HEAP[$86]=12;
        var $87=($rndr+116)&4294967295;
        var $88=($87+152)&4294967295;
        HEAP[$88]=14;
        var $89=HEAP[$4];
        var $90=($89) & 8;
        var $91=((($90))|0)!=0;
        if ($91) { __label__ = 20; break; } else { __label__ = 21; break; }
      case 20: // $92
        var $93=($rndr+116)&4294967295;
        var $94=($93+416)&4294967295;
        HEAP[$94]=16;
        var $95=($rndr+116)&4294967295;
        var $96=($95+408)&4294967295;
        HEAP[$96]=16;
        var $97=($rndr+116)&4294967295;
        var $98=($97+436)&4294967295;
        HEAP[$98]=16;
        __label__ = 21; break;
      case 21: // $99
        var $100=HEAP[$4];
        var $101=($rndr+1152)&4294967295;
        HEAP[$101]=$100;
        var $102=($rndr+1156)&4294967295;
        HEAP[$102]=16;
        HEAP[$beg]=0;
        __label__ = 22; break;
      case 22: // $103
        var $104=HEAP[$beg];
        var $105=HEAP[$2];
        var $106=($105+4)&4294967295;
        var $107=HEAP[$106];
        var $108=unSign(($104), 32, 0) < unSign(($107), 32, 0);
        if ($108) { __label__ = 23; break; } else { __label__ = 24; break; }
      case 23: // $109
        var $110=HEAP[$2];
        var $111=($110)&4294967295;
        var $112=HEAP[$111];
        var $113=HEAP[$beg];
        var $114=HEAP[$2];
        var $115=($114+4)&4294967295;
        var $116=HEAP[$115];
        var $117=($rndr+100)&4294967295;
        var $118=_is_ref($112, $113, $116, $end, $117);
        var $119=((($118))|0)!=0;
        if ($119) { __label__ = 25; break; } else { __label__ = 26; break; }
      case 25: // $120
        var $121=HEAP[$end];
        HEAP[$beg]=$121;
        __label__ = 27; break;
      case 26: // $122
        var $123=HEAP[$beg];
        HEAP[$end]=$123;
        __label__ = 28; break;
      case 28: // $124
        var $125=HEAP[$end];
        var $126=HEAP[$2];
        var $127=($126+4)&4294967295;
        var $128=HEAP[$127];
        var $129=unSign(($125), 32, 0) < unSign(($128), 32, 0);
        if ($129) { __lastLabel__ = 28; __label__ = 29; break; } else { __lastLabel__ = 28; __label__ = 30; break; }
      case 29: // $130
        var $131=HEAP[$end];
        var $132=HEAP[$2];
        var $133=($132)&4294967295;
        var $134=HEAP[$133];
        var $135=($134+$131)&4294967295;
        var $136=HEAP[$135];
        var $137=reSign(($136), 8, 0);
        var $138=((($137))|0)!=10;
        if ($138) { __lastLabel__ = 29; __label__ = 31; break; } else { __lastLabel__ = 29; __label__ = 30; break; }
      case 31: // $139
        var $140=HEAP[$end];
        var $141=HEAP[$2];
        var $142=($141)&4294967295;
        var $143=HEAP[$142];
        var $144=($143+$140)&4294967295;
        var $145=HEAP[$144];
        var $146=reSign(($145), 8, 0);
        var $147=((($146))|0)!=13;
        __lastLabel__ = 31; __label__ = 30; break;
      case 30: // $148
        var $149=__lastLabel__ == 29 ? 0 : (__lastLabel__ == 28 ? 0 : ($147));
        if ($149) { __label__ = 32; break; } else { __label__ = 33; break; }
      case 32: // $150
        var $151=HEAP[$end];
        var $152=(($151) + 1)&4294967295;
        HEAP[$end]=$152;
        __label__ = 28; break;
      case 33: // $153
        var $154=HEAP[$end];
        var $155=HEAP[$beg];
        var $156=unSign(($154), 32, 0) > unSign(($155), 32, 0);
        if ($156) { __label__ = 34; break; } else { __label__ = 35; break; }
      case 34: // $157
        var $158=HEAP[$text];
        var $159=HEAP[$2];
        var $160=($159)&4294967295;
        var $161=HEAP[$160];
        var $162=HEAP[$beg];
        var $163=($161+$162)&4294967295;
        var $164=HEAP[$end];
        var $165=HEAP[$beg];
        var $166=(($164) - ($165))&4294967295;
        _expand_tabs($158, $163, $166);
        __label__ = 35; break;
      case 35: // $167
        __label__ = 36; break;
      case 36: // $168
        var $169=HEAP[$end];
        var $170=HEAP[$2];
        var $171=($170+4)&4294967295;
        var $172=HEAP[$171];
        var $173=unSign(($169), 32, 0) < unSign(($172), 32, 0);
        if ($173) { __lastLabel__ = 36; __label__ = 37; break; } else { __lastLabel__ = 36; __label__ = 38; break; }
      case 37: // $174
        var $175=HEAP[$end];
        var $176=HEAP[$2];
        var $177=($176)&4294967295;
        var $178=HEAP[$177];
        var $179=($178+$175)&4294967295;
        var $180=HEAP[$179];
        var $181=reSign(($180), 8, 0);
        var $182=((($181))|0)==10;
        if ($182) { __lastLabel__ = 37; __label__ = 39; break; } else { __lastLabel__ = 37; __label__ = 40; break; }
      case 40: // $183
        var $184=HEAP[$end];
        var $185=HEAP[$2];
        var $186=($185)&4294967295;
        var $187=HEAP[$186];
        var $188=($187+$184)&4294967295;
        var $189=HEAP[$188];
        var $190=reSign(($189), 8, 0);
        var $191=((($190))|0)==13;
        __lastLabel__ = 40; __label__ = 39; break;
      case 39: // $192
        var $193=__lastLabel__ == 37 ? 1 : ($191);
        __lastLabel__ = 39; __label__ = 38; break;
      case 38: // $194
        var $195=__lastLabel__ == 36 ? 0 : ($193);
        if ($195) { __label__ = 41; break; } else { __label__ = 42; break; }
      case 41: // $196
        var $197=HEAP[$end];
        var $198=HEAP[$2];
        var $199=($198)&4294967295;
        var $200=HEAP[$199];
        var $201=($200+$197)&4294967295;
        var $202=HEAP[$201];
        var $203=reSign(($202), 8, 0);
        var $204=((($203))|0)==10;
        if ($204) { __label__ = 43; break; } else { __label__ = 44; break; }
      case 44: // $205
        var $206=HEAP[$end];
        var $207=(($206) + 1)&4294967295;
        var $208=HEAP[$2];
        var $209=($208+4)&4294967295;
        var $210=HEAP[$209];
        var $211=unSign(($207), 32, 0) < unSign(($210), 32, 0);
        if ($211) { __label__ = 45; break; } else { __label__ = 46; break; }
      case 45: // $212
        var $213=HEAP[$end];
        var $214=(($213) + 1)&4294967295;
        var $215=HEAP[$2];
        var $216=($215)&4294967295;
        var $217=HEAP[$216];
        var $218=($217+$214)&4294967295;
        var $219=HEAP[$218];
        var $220=reSign(($219), 8, 0);
        var $221=((($220))|0)!=10;
        if ($221) { __label__ = 43; break; } else { __label__ = 46; break; }
      case 43: // $222
        var $223=HEAP[$text];
        _bufputc($223, 10);
        __label__ = 46; break;
      case 46: // $224
        var $225=HEAP[$end];
        var $226=(($225) + 1)&4294967295;
        HEAP[$end]=$226;
        __label__ = 36; break;
      case 42: // $227
        var $228=HEAP[$end];
        HEAP[$beg]=$228;
        __label__ = 27; break;
      case 27: // $229
        __label__ = 22; break;
      case 24: // $230
        var $231=($rndr+100)&4294967295;
        var $232=($231+4)&4294967295;
        var $233=HEAP[$232];
        var $234=((($233))|0)!=0;
        if ($234) { __label__ = 47; break; } else { __label__ = 48; break; }
      case 47: // $235
        var $236=($rndr+100)&4294967295;
        var $237=($236)&4294967295;
        var $238=HEAP[$237];
        var $239=($rndr+100)&4294967295;
        var $240=($239+4)&4294967295;
        var $241=HEAP[$240];
        var $242=($rndr+100)&4294967295;
        var $243=($242+12)&4294967295;
        var $244=HEAP[$243];
        _qsort($238, $241, $244, 18);
        __label__ = 48; break;
      case 48: // $245
        var $246=HEAP[$text];
        var $247=($246+4)&4294967295;
        var $248=HEAP[$247];
        var $249=((($248))|0)!=0;
        if ($249) { __label__ = 49; break; } else { __label__ = 50; break; }
      case 50: // $250
        __label__ = 2; break;
      case 49: // $251
        var $252=HEAP[$text];
        var $253=($252+4)&4294967295;
        var $254=HEAP[$253];
        var $255=(($254) - 1)&4294967295;
        var $256=HEAP[$text];
        var $257=($256)&4294967295;
        var $258=HEAP[$257];
        var $259=($258+$255)&4294967295;
        var $260=HEAP[$259];
        var $261=reSign(($260), 8, 0);
        var $262=((($261))|0)!=10;
        if ($262) { __label__ = 51; break; } else { __label__ = 52; break; }
      case 51: // $263
        var $264=HEAP[$text];
        var $265=($264+4)&4294967295;
        var $266=HEAP[$265];
        var $267=(($266) - 1)&4294967295;
        var $268=HEAP[$text];
        var $269=($268)&4294967295;
        var $270=HEAP[$269];
        var $271=($270+$267)&4294967295;
        var $272=HEAP[$271];
        var $273=reSign(($272), 8, 0);
        var $274=((($273))|0)!=13;
        if ($274) { __label__ = 53; break; } else { __label__ = 52; break; }
      case 53: // $275
        var $276=HEAP[$text];
        _bufputc($276, 10);
        __label__ = 52; break;
      case 52: // $277
        var $278=($rndr)&4294967295;
        var $279=($278+88)&4294967295;
        var $280=HEAP[$279];
        var $281=($280)!=0;
        if ($281) { __label__ = 54; break; } else { __label__ = 55; break; }
      case 54: // $282
        var $283=($rndr)&4294967295;
        var $284=($283+88)&4294967295;
        var $285=HEAP[$284];
        var $286=HEAP[$1];
        var $287=($rndr)&4294967295;
        var $288=($287+96)&4294967295;
        var $289=HEAP[$288];
        FUNCTION_TABLE[$285]($286, $289);
        __label__ = 55; break;
      case 55: // $290
        var $291=HEAP[$1];
        var $292=HEAP[$text];
        var $293=($292)&4294967295;
        var $294=HEAP[$293];
        var $295=HEAP[$text];
        var $296=($295+4)&4294967295;
        var $297=HEAP[$296];
        _parse_block($291, $rndr, $294, $297);
        var $298=($rndr)&4294967295;
        var $299=($298+92)&4294967295;
        var $300=HEAP[$299];
        var $301=($300)!=0;
        if ($301) { __label__ = 56; break; } else { __label__ = 57; break; }
      case 56: // $302
        var $303=($rndr)&4294967295;
        var $304=($303+92)&4294967295;
        var $305=HEAP[$304];
        var $306=HEAP[$1];
        var $307=($rndr)&4294967295;
        var $308=($307+96)&4294967295;
        var $309=HEAP[$308];
        FUNCTION_TABLE[$305]($306, $309);
        __label__ = 57; break;
      case 57: // $310
        var $311=HEAP[$text];
        _bufrelease($311);
        var $312=($rndr+100)&4294967295;
        var $313=($312)&4294967295;
        var $314=HEAP[$313];
        var $315=$314;
        HEAP[$lr]=$315;
        HEAP[$i]=0;
        __label__ = 58; break;
      case 58: // $316
        var $317=HEAP[$i];
        var $318=($rndr+100)&4294967295;
        var $319=($318+4)&4294967295;
        var $320=HEAP[$319];
        var $321=unSign(($317), 32, 0) < unSign(($320), 32, 0);
        if ($321) { __label__ = 59; break; } else { __label__ = 60; break; }
      case 59: // $322
        var $323=HEAP[$i];
        var $324=HEAP[$lr];
        var $325=($324+12*$323)&4294967295;
        var $326=($325)&4294967295;
        var $327=HEAP[$326];
        _bufrelease($327);
        var $328=HEAP[$i];
        var $329=HEAP[$lr];
        var $330=($329+12*$328)&4294967295;
        var $331=($330+4)&4294967295;
        var $332=HEAP[$331];
        _bufrelease($332);
        var $333=HEAP[$i];
        var $334=HEAP[$lr];
        var $335=($334+12*$333)&4294967295;
        var $336=($335+8)&4294967295;
        var $337=HEAP[$336];
        _bufrelease($337);
        __label__ = 61; break;
      case 61: // $338
        var $339=HEAP[$i];
        var $340=(($339) + 1)&4294967295;
        HEAP[$i]=$340;
        __label__ = 58; break;
      case 60: // $341
        var $342=($rndr+100)&4294967295;
        _arr_free($342);
        var $343=($rndr+1140)&4294967295;
        var $344=($343+4)&4294967295;
        var $345=HEAP[$344];
        var $346=((($345))|0)==0;
        var $347=($346) ^ 1;
        if ($347) { __label__ = 62; break; } else { __label__ = 63; break; }
      case 62: // $348
        ___assert_rtn((___func___ups_markdown)&4294967295, (__str4)&4294967295, 2035, (__str5)&4294967295);
        throw "Reached an unreachable! Original .ll line: 741";
        __label__ = 64; break;
      case 63: // $350
        __label__ = 64; break;
      case 64: // $351
        HEAP[$i]=0;
        __label__ = 65; break;
      case 65: // $352
        var $353=HEAP[$i];
        var $354=($rndr+1140)&4294967295;
        var $355=($354+8)&4294967295;
        var $356=HEAP[$355];
        var $357=unSign(($353), 32, 0) < unSign(($356), 32, 0);
        if ($357) { __label__ = 66; break; } else { __label__ = 67; break; }
      case 66: // $358
        var $359=HEAP[$i];
        var $360=($rndr+1140)&4294967295;
        var $361=($360)&4294967295;
        var $362=HEAP[$361];
        var $363=($362+4*$359)&4294967295;
        var $364=HEAP[$363];
        var $365=$364;
        _bufrelease($365);
        __label__ = 68; break;
      case 68: // $366
        var $367=HEAP[$i];
        var $368=(($367) + 1)&4294967295;
        HEAP[$i]=$368;
        __label__ = 65; break;
      case 67: // $369
        var $370=($rndr+1140)&4294967295;
        _parr_free($370);
        __label__ = 2; break;
      case 2: // $371
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _char_emphasis($ob, $rndr, $data, $offset, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 29; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 29);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $6=__stackBase__+20;
        var $c=__stackBase__+24;
        var $ret=__stackBase__+25;
        HEAP[$2]=$ob;
        HEAP[$3]=$rndr;
        HEAP[$4]=$data;
        HEAP[$5]=$offset;
        HEAP[$6]=$size;
        var $7=HEAP[$4];
        var $8=($7)&4294967295;
        var $9=HEAP[$8];
        HEAP[$c]=$9;
        var $10=HEAP[$6];
        var $11=unSign(($10), 32, 0) > 2;
        if ($11) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $12
        var $13=HEAP[$4];
        var $14=($13+1)&4294967295;
        var $15=HEAP[$14];
        var $16=reSign(($15), 8, 0);
        var $17=HEAP[$c];
        var $18=reSign(($17), 8, 0);
        var $19=((($16))|0)!=((($18))|0);
        if ($19) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 2: // $20
        var $21=HEAP[$4];
        var $22=($21+1)&4294967295;
        var $23=HEAP[$22];
        var $24=reSign(($23), 8, 0);
        var $25=_isspace($24);
        var $26=((($25))|0)!=0;
        if ($26) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 4: // $27
        var $28=HEAP[$2];
        var $29=HEAP[$3];
        var $30=HEAP[$4];
        var $31=($30+1)&4294967295;
        var $32=HEAP[$6];
        var $33=(($32) - 1)&4294967295;
        var $34=HEAP[$c];
        var $35=_parse_emph1($28, $29, $31, $33, $34);
        HEAP[$ret]=$35;
        var $36=((($35))|0)==0;
        if ($36) { __label__ = 3; break; } else { __label__ = 5; break; }
      case 3: // $37
        HEAP[$1]=0;
        __label__ = 6; break;
      case 5: // $38
        var $39=HEAP[$ret];
        var $40=(($39) + 1)&4294967295;
        HEAP[$1]=$40;
        __label__ = 6; break;
      case 1: // $41
        var $42=HEAP[$6];
        var $43=unSign(($42), 32, 0) > 3;
        if ($43) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $44
        var $45=HEAP[$4];
        var $46=($45+1)&4294967295;
        var $47=HEAP[$46];
        var $48=reSign(($47), 8, 0);
        var $49=HEAP[$c];
        var $50=reSign(($49), 8, 0);
        var $51=((($48))|0)==((($50))|0);
        if ($51) { __label__ = 9; break; } else { __label__ = 8; break; }
      case 9: // $52
        var $53=HEAP[$4];
        var $54=($53+2)&4294967295;
        var $55=HEAP[$54];
        var $56=reSign(($55), 8, 0);
        var $57=HEAP[$c];
        var $58=reSign(($57), 8, 0);
        var $59=((($56))|0)!=((($58))|0);
        if ($59) { __label__ = 10; break; } else { __label__ = 8; break; }
      case 10: // $60
        var $61=HEAP[$4];
        var $62=($61+2)&4294967295;
        var $63=HEAP[$62];
        var $64=reSign(($63), 8, 0);
        var $65=_isspace($64);
        var $66=((($65))|0)!=0;
        if ($66) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 12: // $67
        var $68=HEAP[$2];
        var $69=HEAP[$3];
        var $70=HEAP[$4];
        var $71=($70+2)&4294967295;
        var $72=HEAP[$6];
        var $73=(($72) - 2)&4294967295;
        var $74=HEAP[$c];
        var $75=_parse_emph2($68, $69, $71, $73, $74);
        HEAP[$ret]=$75;
        var $76=((($75))|0)==0;
        if ($76) { __label__ = 11; break; } else { __label__ = 13; break; }
      case 11: // $77
        HEAP[$1]=0;
        __label__ = 6; break;
      case 13: // $78
        var $79=HEAP[$ret];
        var $80=(($79) + 2)&4294967295;
        HEAP[$1]=$80;
        __label__ = 6; break;
      case 8: // $81
        var $82=HEAP[$6];
        var $83=unSign(($82), 32, 0) > 4;
        if ($83) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 14: // $84
        var $85=HEAP[$4];
        var $86=($85+1)&4294967295;
        var $87=HEAP[$86];
        var $88=reSign(($87), 8, 0);
        var $89=HEAP[$c];
        var $90=reSign(($89), 8, 0);
        var $91=((($88))|0)==((($90))|0);
        if ($91) { __label__ = 16; break; } else { __label__ = 15; break; }
      case 16: // $92
        var $93=HEAP[$4];
        var $94=($93+2)&4294967295;
        var $95=HEAP[$94];
        var $96=reSign(($95), 8, 0);
        var $97=HEAP[$c];
        var $98=reSign(($97), 8, 0);
        var $99=((($96))|0)==((($98))|0);
        if ($99) { __label__ = 17; break; } else { __label__ = 15; break; }
      case 17: // $100
        var $101=HEAP[$4];
        var $102=($101+3)&4294967295;
        var $103=HEAP[$102];
        var $104=reSign(($103), 8, 0);
        var $105=HEAP[$c];
        var $106=reSign(($105), 8, 0);
        var $107=((($104))|0)!=((($106))|0);
        if ($107) { __label__ = 18; break; } else { __label__ = 15; break; }
      case 18: // $108
        var $109=HEAP[$4];
        var $110=($109+3)&4294967295;
        var $111=HEAP[$110];
        var $112=reSign(($111), 8, 0);
        var $113=_isspace($112);
        var $114=((($113))|0)!=0;
        if ($114) { __label__ = 19; break; } else { __label__ = 20; break; }
      case 20: // $115
        var $116=HEAP[$2];
        var $117=HEAP[$3];
        var $118=HEAP[$4];
        var $119=($118+3)&4294967295;
        var $120=HEAP[$6];
        var $121=(($120) - 3)&4294967295;
        var $122=HEAP[$c];
        var $123=_parse_emph3($116, $117, $119, $121, $122);
        HEAP[$ret]=$123;
        var $124=((($123))|0)==0;
        if ($124) { __label__ = 19; break; } else { __label__ = 21; break; }
      case 19: // $125
        HEAP[$1]=0;
        __label__ = 6; break;
      case 21: // $126
        var $127=HEAP[$ret];
        var $128=(($127) + 3)&4294967295;
        HEAP[$1]=$128;
        __label__ = 6; break;
      case 15: // $129
        HEAP[$1]=0;
        __label__ = 6; break;
      case 6: // $130
        var $131=HEAP[$1];
        STACKTOP = __stackBase__;
        return $131;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _char_codespan($ob, $rndr, $data, $offset, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 64; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 64);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $6=__stackBase__+20;
        var $end=__stackBase__+24;
        var $nb=__stackBase__+28;
        var $i=__stackBase__+32;
        var $f_begin=__stackBase__+36;
        var $f_end=__stackBase__+40;
        var $work=__stackBase__+44;
        HEAP[$2]=$ob;
        HEAP[$3]=$rndr;
        HEAP[$4]=$data;
        HEAP[$5]=$offset;
        HEAP[$6]=$size;
        HEAP[$nb]=0;
        __label__ = 0; break;
      case 0: // $7
        var $8=HEAP[$nb];
        var $9=HEAP[$6];
        var $10=unSign(($8), 32, 0) < unSign(($9), 32, 0);
        if ($10) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 1: // $11
        var $12=HEAP[$nb];
        var $13=HEAP[$4];
        var $14=($13+$12)&4294967295;
        var $15=HEAP[$14];
        var $16=reSign(($15), 8, 0);
        var $17=((($16))|0)==96;
        __lastLabel__ = 1; __label__ = 2; break;
      case 2: // $18
        var $19=__lastLabel__ == 0 ? 0 : ($17);
        if ($19) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $20
        var $21=HEAP[$nb];
        var $22=(($21) + 1)&4294967295;
        HEAP[$nb]=$22;
        __label__ = 0; break;
      case 4: // $23
        HEAP[$i]=0;
        var $24=HEAP[$nb];
        HEAP[$end]=$24;
        __label__ = 5; break;
      case 5: // $25
        var $26=HEAP[$end];
        var $27=HEAP[$6];
        var $28=unSign(($26), 32, 0) < unSign(($27), 32, 0);
        if ($28) { __lastLabel__ = 5; __label__ = 6; break; } else { __lastLabel__ = 5; __label__ = 7; break; }
      case 6: // $29
        var $30=HEAP[$i];
        var $31=HEAP[$nb];
        var $32=unSign(($30), 32, 0) < unSign(($31), 32, 0);
        __lastLabel__ = 6; __label__ = 7; break;
      case 7: // $33
        var $34=__lastLabel__ == 5 ? 0 : ($32);
        if ($34) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $35
        var $36=HEAP[$end];
        var $37=HEAP[$4];
        var $38=($37+$36)&4294967295;
        var $39=HEAP[$38];
        var $40=reSign(($39), 8, 0);
        var $41=((($40))|0)==96;
        if ($41) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $42
        var $43=HEAP[$i];
        var $44=(($43) + 1)&4294967295;
        HEAP[$i]=$44;
        __label__ = 12; break;
      case 11: // $45
        HEAP[$i]=0;
        __label__ = 12; break;
      case 12: // $46
        __label__ = 13; break;
      case 13: // $47
        var $48=HEAP[$end];
        var $49=(($48) + 1)&4294967295;
        HEAP[$end]=$49;
        __label__ = 5; break;
      case 9: // $50
        var $51=HEAP[$i];
        var $52=HEAP[$nb];
        var $53=unSign(($51), 32, 0) < unSign(($52), 32, 0);
        if ($53) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 14: // $54
        var $55=HEAP[$end];
        var $56=HEAP[$6];
        var $57=unSign(($55), 32, 0) >= unSign(($56), 32, 0);
        if ($57) { __label__ = 16; break; } else { __label__ = 15; break; }
      case 16: // $58
        HEAP[$1]=0;
        __label__ = 17; break;
      case 15: // $59
        var $60=HEAP[$nb];
        HEAP[$f_begin]=$60;
        __label__ = 18; break;
      case 18: // $61
        var $62=HEAP[$f_begin];
        var $63=HEAP[$end];
        var $64=unSign(($62), 32, 0) < unSign(($63), 32, 0);
        if ($64) { __lastLabel__ = 18; __label__ = 19; break; } else { __lastLabel__ = 18; __label__ = 20; break; }
      case 19: // $65
        var $66=HEAP[$f_begin];
        var $67=HEAP[$4];
        var $68=($67+$66)&4294967295;
        var $69=HEAP[$68];
        var $70=reSign(($69), 8, 0);
        var $71=((($70))|0)==32;
        if ($71) { __lastLabel__ = 19; __label__ = 21; break; } else { __lastLabel__ = 19; __label__ = 22; break; }
      case 22: // $72
        var $73=HEAP[$f_begin];
        var $74=HEAP[$4];
        var $75=($74+$73)&4294967295;
        var $76=HEAP[$75];
        var $77=reSign(($76), 8, 0);
        var $78=((($77))|0)==9;
        __lastLabel__ = 22; __label__ = 21; break;
      case 21: // $79
        var $80=__lastLabel__ == 19 ? 1 : ($78);
        __lastLabel__ = 21; __label__ = 20; break;
      case 20: // $81
        var $82=__lastLabel__ == 18 ? 0 : ($80);
        if ($82) { __label__ = 23; break; } else { __label__ = 24; break; }
      case 23: // $83
        var $84=HEAP[$f_begin];
        var $85=(($84) + 1)&4294967295;
        HEAP[$f_begin]=$85;
        __label__ = 18; break;
      case 24: // $86
        var $87=HEAP[$end];
        var $88=HEAP[$nb];
        var $89=(($87) - ($88))&4294967295;
        HEAP[$f_end]=$89;
        __label__ = 25; break;
      case 25: // $90
        var $91=HEAP[$f_end];
        var $92=HEAP[$nb];
        var $93=unSign(($91), 32, 0) > unSign(($92), 32, 0);
        if ($93) { __lastLabel__ = 25; __label__ = 26; break; } else { __lastLabel__ = 25; __label__ = 27; break; }
      case 26: // $94
        var $95=HEAP[$f_end];
        var $96=(($95) - 1)&4294967295;
        var $97=HEAP[$4];
        var $98=($97+$96)&4294967295;
        var $99=HEAP[$98];
        var $100=reSign(($99), 8, 0);
        var $101=((($100))|0)==32;
        if ($101) { __lastLabel__ = 26; __label__ = 28; break; } else { __lastLabel__ = 26; __label__ = 29; break; }
      case 29: // $102
        var $103=HEAP[$f_end];
        var $104=(($103) - 1)&4294967295;
        var $105=HEAP[$4];
        var $106=($105+$104)&4294967295;
        var $107=HEAP[$106];
        var $108=reSign(($107), 8, 0);
        var $109=((($108))|0)==9;
        __lastLabel__ = 29; __label__ = 28; break;
      case 28: // $110
        var $111=__lastLabel__ == 26 ? 1 : ($109);
        __lastLabel__ = 28; __label__ = 27; break;
      case 27: // $112
        var $113=__lastLabel__ == 25 ? 0 : ($111);
        if ($113) { __label__ = 30; break; } else { __label__ = 31; break; }
      case 30: // $114
        var $115=HEAP[$f_end];
        var $116=(($115) + -1)&4294967295;
        HEAP[$f_end]=$116;
        __label__ = 25; break;
      case 31: // $117
        var $118=HEAP[$f_begin];
        var $119=HEAP[$f_end];
        var $120=unSign(($118), 32, 0) < unSign(($119), 32, 0);
        if ($120) { __label__ = 32; break; } else { __label__ = 33; break; }
      case 32: // $121
        var $122=($work)&4294967295;
        var $123=HEAP[$4];
        var $124=HEAP[$f_begin];
        var $125=($123+$124)&4294967295;
        HEAP[$122]=$125;
        var $126=($work+4)&4294967295;
        var $127=HEAP[$f_end];
        var $128=HEAP[$f_begin];
        var $129=(($127) - ($128))&4294967295;
        HEAP[$126]=$129;
        var $130=($work+8)&4294967295;
        HEAP[$130]=0;
        var $131=($work+12)&4294967295;
        HEAP[$131]=0;
        var $132=($work+16)&4294967295;
        HEAP[$132]=0;
        var $133=HEAP[$3];
        var $134=($133)&4294967295;
        var $135=($134+48)&4294967295;
        var $136=HEAP[$135];
        var $137=HEAP[$2];
        var $138=HEAP[$3];
        var $139=($138)&4294967295;
        var $140=($139+96)&4294967295;
        var $141=HEAP[$140];
        var $142=FUNCTION_TABLE[$136]($137, $work, $141);
        var $143=((($142))|0)!=0;
        if ($143) { __label__ = 34; break; } else { __label__ = 35; break; }
      case 35: // $144
        HEAP[$end]=0;
        __label__ = 34; break;
      case 34: // $145
        __label__ = 36; break;
      case 33: // $146
        var $147=HEAP[$3];
        var $148=($147)&4294967295;
        var $149=($148+48)&4294967295;
        var $150=HEAP[$149];
        var $151=HEAP[$2];
        var $152=HEAP[$3];
        var $153=($152)&4294967295;
        var $154=($153+96)&4294967295;
        var $155=HEAP[$154];
        var $156=FUNCTION_TABLE[$150]($151, 0, $155);
        var $157=((($156))|0)!=0;
        if ($157) { __label__ = 37; break; } else { __label__ = 38; break; }
      case 38: // $158
        HEAP[$end]=0;
        __label__ = 37; break;
      case 37: // $159
        __label__ = 36; break;
      case 36: // $160
        var $161=HEAP[$end];
        HEAP[$1]=$161;
        __label__ = 17; break;
      case 17: // $162
        var $163=HEAP[$1];
        STACKTOP = __stackBase__;
        return $163;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _char_linebreak($ob, $rndr, $data, $offset, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 24);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $6=__stackBase__+20;
        HEAP[$2]=$ob;
        HEAP[$3]=$rndr;
        HEAP[$4]=$data;
        HEAP[$5]=$offset;
        HEAP[$6]=$size;
        var $7=HEAP[$5];
        var $8=unSign(($7), 32, 0) < 2;
        if ($8) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $9
        var $10=HEAP[$4];
        var $11=($10+-1)&4294967295;
        var $12=HEAP[$11];
        var $13=reSign(($12), 8, 0);
        var $14=((($13))|0)!=32;
        if ($14) { __label__ = 0; break; } else { __label__ = 2; break; }
      case 2: // $15
        var $16=HEAP[$4];
        var $17=($16+-2)&4294967295;
        var $18=HEAP[$17];
        var $19=reSign(($18), 8, 0);
        var $20=((($19))|0)!=32;
        if ($20) { __label__ = 0; break; } else { __label__ = 3; break; }
      case 0: // $21
        HEAP[$1]=0;
        __label__ = 4; break;
      case 3: // $22
        __label__ = 5; break;
      case 5: // $23
        var $24=HEAP[$2];
        var $25=($24+4)&4294967295;
        var $26=HEAP[$25];
        var $27=((($26))|0)!=0;
        if ($27) { __lastLabel__ = 5; __label__ = 6; break; } else { __lastLabel__ = 5; __label__ = 7; break; }
      case 6: // $28
        var $29=HEAP[$2];
        var $30=($29+4)&4294967295;
        var $31=HEAP[$30];
        var $32=(($31) - 1)&4294967295;
        var $33=HEAP[$2];
        var $34=($33)&4294967295;
        var $35=HEAP[$34];
        var $36=($35+$32)&4294967295;
        var $37=HEAP[$36];
        var $38=reSign(($37), 8, 0);
        var $39=((($38))|0)==32;
        __lastLabel__ = 6; __label__ = 7; break;
      case 7: // $40
        var $41=__lastLabel__ == 5 ? 0 : ($39);
        if ($41) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $42
        var $43=HEAP[$2];
        var $44=($43+4)&4294967295;
        var $45=HEAP[$44];
        var $46=(($45) + -1)&4294967295;
        HEAP[$44]=$46;
        __label__ = 5; break;
      case 9: // $47
        var $48=HEAP[$3];
        var $49=($48)&4294967295;
        var $50=($49+64)&4294967295;
        var $51=HEAP[$50];
        var $52=HEAP[$2];
        var $53=HEAP[$3];
        var $54=($53)&4294967295;
        var $55=($54+96)&4294967295;
        var $56=HEAP[$55];
        var $57=FUNCTION_TABLE[$51]($52, $56);
        var $58=((($57))|0)!=0;
        var $59=($58) ? 1 : 0;
        HEAP[$1]=$59;
        __label__ = 4; break;
      case 4: // $60
        var $61=HEAP[$1];
        STACKTOP = __stackBase__;
        return $61;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _char_link($ob, $rndr, $data, $offset, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 140; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 140);
    var __label__;
    var __lastLabel__ = null;
    __label__ = 0; 
    while(1) switch(__label__) {
      case 0: // $0
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $is_img=__stackBase__+20;
        var $level=__stackBase__+24;
        var $i=__stackBase__+28;
        var $txt_e=__stackBase__+32;
        var $link_b=__stackBase__+36;
        var $link_e=__stackBase__+40;
        var $title_b=__stackBase__+44;
        var $title_e=__stackBase__+48;
        var $content=__stackBase__+52;
        var $link=__stackBase__+56;
        var $title=__stackBase__+60;
        var $org_work_size=__stackBase__+64;
        var $text_has_nl=__stackBase__+68;
        var $ret=__stackBase__+72;
        var $id=__stackBase__+76;
        var $lr=__stackBase__+96;
        var $b=__stackBase__+100;
        var $j=__stackBase__+104;
        var $id1=__stackBase__+108;
        var $lr2=__stackBase__+128;
        var $b3=__stackBase__+132;
        var $j4=__stackBase__+136;
        HEAP[$1]=$ob;
        HEAP[$2]=$rndr;
        HEAP[$3]=$data;
        HEAP[$4]=$offset;
        HEAP[$5]=$size;
        var $6=HEAP[$4];
        var $7=((($6))|0)!=0;
        if ($7) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 1: // $8
        var $9=HEAP[$3];
        var $10=($9+-1)&4294967295;
        var $11=HEAP[$10];
        var $12=reSign(($11), 8, 0);
        var $13=((($12))|0)==33;
        __lastLabel__ = 1; __label__ = 2; break;
      case 2: // $14
        var $15=__lastLabel__ == 0 ? 0 : ($13);
        var $16=unSign(($15), 1, 0);
        HEAP[$is_img]=$16;
        HEAP[$i]=1;
        HEAP[$link_b]=0;
        HEAP[$link_e]=0;
        HEAP[$title_b]=0;
        HEAP[$title_e]=0;
        HEAP[$content]=0;
        HEAP[$link]=0;
        HEAP[$title]=0;
        var $17=HEAP[$2];
        var $18=($17+1140)&4294967295;
        var $19=($18+4)&4294967295;
        var $20=HEAP[$19];
        HEAP[$org_work_size]=$20;
        HEAP[$text_has_nl]=0;
        HEAP[$ret]=0;
        var $21=HEAP[$is_img];
        var $22=((($21))|0)!=0;
        if ($22) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $23
        var $24=HEAP[$2];
        var $25=($24)&4294967295;
        var $26=($25+60)&4294967295;
        var $27=HEAP[$26];
        var $28=($27)!=0;
        if ($28) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $29
        var $30=HEAP[$is_img];
        var $31=((($30))|0)!=0;
        if ($31) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 7: // $32
        var $33=HEAP[$2];
        var $34=($33)&4294967295;
        var $35=($34+68)&4294967295;
        var $36=HEAP[$35];
        var $37=($36)!=0;
        if ($37) { __label__ = 6; break; } else { __label__ = 5; break; }
      case 5: // $38
        __label__ = 8; break;
      case 6: // $39
        HEAP[$level]=1;
        __label__ = 9; break;
      case 9: // $40
        var $41=HEAP[$i];
        var $42=HEAP[$5];
        var $43=unSign(($41), 32, 0) < unSign(($42), 32, 0);
        if ($43) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $44
        var $45=HEAP[$i];
        var $46=HEAP[$3];
        var $47=($46+$45)&4294967295;
        var $48=HEAP[$47];
        var $49=reSign(($48), 8, 0);
        var $50=((($49))|0)==10;
        if ($50) { __label__ = 12; break; } else { __label__ = 13; break; }
      case 12: // $51
        HEAP[$text_has_nl]=1;
        __label__ = 14; break;
      case 13: // $52
        var $53=HEAP[$i];
        var $54=(($53) - 1)&4294967295;
        var $55=HEAP[$3];
        var $56=($55+$54)&4294967295;
        var $57=HEAP[$56];
        var $58=reSign(($57), 8, 0);
        var $59=((($58))|0)==92;
        if ($59) { __label__ = 15; break; } else { __label__ = 16; break; }
      case 15: // $60
        __label__ = 17; break;
      case 16: // $61
        var $62=HEAP[$i];
        var $63=HEAP[$3];
        var $64=($63+$62)&4294967295;
        var $65=HEAP[$64];
        var $66=reSign(($65), 8, 0);
        var $67=((($66))|0)==91;
        if ($67) { __label__ = 18; break; } else { __label__ = 19; break; }
      case 18: // $68
        var $69=HEAP[$level];
        var $70=(($69) + 1)&4294967295;
        HEAP[$level]=$70;
        __label__ = 20; break;
      case 19: // $71
        var $72=HEAP[$i];
        var $73=HEAP[$3];
        var $74=($73+$72)&4294967295;
        var $75=HEAP[$74];
        var $76=reSign(($75), 8, 0);
        var $77=((($76))|0)==93;
        if ($77) { __label__ = 21; break; } else { __label__ = 22; break; }
      case 21: // $78
        var $79=HEAP[$level];
        var $80=(($79) + -1)&4294967295;
        HEAP[$level]=$80;
        var $81=HEAP[$level];
        var $82=((($81))|0) <= 0;
        if ($82) { __label__ = 23; break; } else { __label__ = 24; break; }
      case 23: // $83
        __label__ = 11; break;
      case 24: // $84
        __label__ = 22; break;
      case 22: // $85
        __label__ = 20; break;
      case 20: // $86
        __label__ = 25; break;
      case 25: // $87
        __label__ = 14; break;
      case 14: // $88
        __label__ = 17; break;
      case 17: // $89
        var $90=HEAP[$i];
        var $91=(($90) + 1)&4294967295;
        HEAP[$i]=$91;
        __label__ = 9; break;
      case 11: // $92
        var $93=HEAP[$i];
        var $94=HEAP[$5];
        var $95=unSign(($93), 32, 0) >= unSign(($94), 32, 0);
        if ($95) { __label__ = 26; break; } else { __label__ = 27; break; }
      case 26: // $96
        __label__ = 8; break;
      case 27: // $97
        var $98=HEAP[$i];
        HEAP[$txt_e]=$98;
        var $99=HEAP[$i];
        var $100=(($99) + 1)&4294967295;
        HEAP[$i]=$100;
        __label__ = 28; break;
      case 28: // $101
        var $102=HEAP[$i];
        var $103=HEAP[$5];
        var $104=unSign(($102), 32, 0) < unSign(($103), 32, 0);
        if ($104) { __lastLabel__ = 28; __label__ = 29; break; } else { __lastLabel__ = 28; __label__ = 30; break; }
      case 29: // $105
        var $106=HEAP[$i];
        var $107=HEAP[$3];
        var $108=($107+$106)&4294967295;
        var $109=HEAP[$108];
        var $110=reSign(($109), 8, 0);
        var $111=_isspace($110);
        var $112=((($111))|0)!=0;
        __lastLabel__ = 29; __label__ = 30; break;
      case 30: // $113
        var $114=__lastLabel__ == 28 ? 0 : ($112);
        if ($114) { __label__ = 31; break; } else { __label__ = 32; break; }
      case 31: // $115
        var $116=HEAP[$i];
        var $117=(($116) + 1)&4294967295;
        HEAP[$i]=$117;
        __label__ = 28; break;
      case 32: // $118
        var $119=HEAP[$i];
        var $120=HEAP[$5];
        var $121=unSign(($119), 32, 0) < unSign(($120), 32, 0);
        if ($121) { __label__ = 33; break; } else { __label__ = 34; break; }
      case 33: // $122
        var $123=HEAP[$i];
        var $124=HEAP[$3];
        var $125=($124+$123)&4294967295;
        var $126=HEAP[$125];
        var $127=reSign(($126), 8, 0);
        var $128=((($127))|0)==40;
        if ($128) { __label__ = 35; break; } else { __label__ = 34; break; }
      case 35: // $129
        var $130=HEAP[$i];
        var $131=(($130) + 1)&4294967295;
        HEAP[$i]=$131;
        __label__ = 36; break;
      case 36: // $132
        var $133=HEAP[$i];
        var $134=HEAP[$5];
        var $135=unSign(($133), 32, 0) < unSign(($134), 32, 0);
        if ($135) { __lastLabel__ = 36; __label__ = 37; break; } else { __lastLabel__ = 36; __label__ = 38; break; }
      case 37: // $136
        var $137=HEAP[$i];
        var $138=HEAP[$3];
        var $139=($138+$137)&4294967295;
        var $140=HEAP[$139];
        var $141=reSign(($140), 8, 0);
        var $142=((($141))|0)==32;
        if ($142) { __lastLabel__ = 37; __label__ = 39; break; } else { __lastLabel__ = 37; __label__ = 40; break; }
      case 40: // $143
        var $144=HEAP[$i];
        var $145=HEAP[$3];
        var $146=($145+$144)&4294967295;
        var $147=HEAP[$146];
        var $148=reSign(($147), 8, 0);
        var $149=((($148))|0)==9;
        __lastLabel__ = 40; __label__ = 39; break;
      case 39: // $150
        var $151=__lastLabel__ == 37 ? 1 : ($149);
        __lastLabel__ = 39; __label__ = 38; break;
      case 38: // $152
        var $153=__lastLabel__ == 36 ? 0 : ($151);
        if ($153) { __label__ = 41; break; } else { __label__ = 42; break; }
      case 41: // $154
        var $155=HEAP[$i];
        var $156=(($155) + 1)&4294967295;
        HEAP[$i]=$156;
        __label__ = 36; break;
      case 42: // $157
        var $158=HEAP[$i];
        HEAP[$link_b]=$158;
        __label__ = 43; break;
      case 43: // $159
        var $160=HEAP[$i];
        var $161=HEAP[$5];
        var $162=unSign(($160), 32, 0) < unSign(($161), 32, 0);
        if ($162) { __lastLabel__ = 43; __label__ = 44; break; } else { __lastLabel__ = 43; __label__ = 45; break; }
      case 44: // $163
        var $164=HEAP[$i];
        var $165=HEAP[$3];
        var $166=($165+$164)&4294967295;
        var $167=HEAP[$166];
        var $168=reSign(($167), 8, 0);
        var $169=((($168))|0)!=39;
        if ($169) { __lastLabel__ = 44; __label__ = 46; break; } else { __lastLabel__ = 44; __label__ = 45; break; }
      case 46: // $170
        var $171=HEAP[$i];
        var $172=HEAP[$3];
        var $173=($172+$171)&4294967295;
        var $174=HEAP[$173];
        var $175=reSign(($174), 8, 0);
        var $176=((($175))|0)!=34;
        if ($176) { __lastLabel__ = 46; __label__ = 47; break; } else { __lastLabel__ = 46; __label__ = 45; break; }
      case 47: // $177
        var $178=HEAP[$i];
        var $179=HEAP[$3];
        var $180=($179+$178)&4294967295;
        var $181=HEAP[$180];
        var $182=reSign(($181), 8, 0);
        var $183=((($182))|0)!=41;
        __lastLabel__ = 47; __label__ = 45; break;
      case 45: // $184
        var $185=__lastLabel__ == 46 ? 0 : (__lastLabel__ == 44 ? 0 : (__lastLabel__ == 43 ? 0 : ($183)));
        if ($185) { __label__ = 48; break; } else { __label__ = 49; break; }
      case 48: // $186
        var $187=HEAP[$i];
        var $188=(($187) + 1)&4294967295;
        HEAP[$i]=$188;
        __label__ = 43; break;
      case 49: // $189
        var $190=HEAP[$i];
        var $191=HEAP[$5];
        var $192=unSign(($190), 32, 0) >= unSign(($191), 32, 0);
        if ($192) { __label__ = 50; break; } else { __label__ = 51; break; }
      case 50: // $193
        __label__ = 8; break;
      case 51: // $194
        var $195=HEAP[$i];
        HEAP[$link_e]=$195;
        var $196=HEAP[$i];
        var $197=HEAP[$3];
        var $198=($197+$196)&4294967295;
        var $199=HEAP[$198];
        var $200=reSign(($199), 8, 0);
        var $201=((($200))|0)==39;
        if ($201) { __label__ = 52; break; } else { __label__ = 53; break; }
      case 53: // $202
        var $203=HEAP[$i];
        var $204=HEAP[$3];
        var $205=($204+$203)&4294967295;
        var $206=HEAP[$205];
        var $207=reSign(($206), 8, 0);
        var $208=((($207))|0)==34;
        if ($208) { __label__ = 52; break; } else { __label__ = 54; break; }
      case 52: // $209
        var $210=HEAP[$i];
        var $211=(($210) + 1)&4294967295;
        HEAP[$i]=$211;
        var $212=HEAP[$i];
        HEAP[$title_b]=$212;
        __label__ = 55; break;
      case 55: // $213
        var $214=HEAP[$i];
        var $215=HEAP[$5];
        var $216=unSign(($214), 32, 0) < unSign(($215), 32, 0);
        if ($216) { __lastLabel__ = 55; __label__ = 56; break; } else { __lastLabel__ = 55; __label__ = 57; break; }
      case 56: // $217
        var $218=HEAP[$i];
        var $219=HEAP[$3];
        var $220=($219+$218)&4294967295;
        var $221=HEAP[$220];
        var $222=reSign(($221), 8, 0);
        var $223=((($222))|0)!=41;
        __lastLabel__ = 56; __label__ = 57; break;
      case 57: // $224
        var $225=__lastLabel__ == 55 ? 0 : ($223);
        if ($225) { __label__ = 58; break; } else { __label__ = 59; break; }
      case 58: // $226
        var $227=HEAP[$i];
        var $228=(($227) + 1)&4294967295;
        HEAP[$i]=$228;
        __label__ = 55; break;
      case 59: // $229
        var $230=HEAP[$i];
        var $231=HEAP[$5];
        var $232=unSign(($230), 32, 0) >= unSign(($231), 32, 0);
        if ($232) { __label__ = 60; break; } else { __label__ = 61; break; }
      case 60: // $233
        __label__ = 8; break;
      case 61: // $234
        var $235=HEAP[$i];
        var $236=(($235) - 1)&4294967295;
        HEAP[$title_e]=$236;
        __label__ = 62; break;
      case 62: // $237
        var $238=HEAP[$title_e];
        var $239=HEAP[$title_b];
        var $240=unSign(($238), 32, 0) > unSign(($239), 32, 0);
        if ($240) { __lastLabel__ = 62; __label__ = 63; break; } else { __lastLabel__ = 62; __label__ = 64; break; }
      case 63: // $241
        var $242=HEAP[$title_e];
        var $243=HEAP[$3];
        var $244=($243+$242)&4294967295;
        var $245=HEAP[$244];
        var $246=reSign(($245), 8, 0);
        var $247=_isspace($246);
        var $248=((($247))|0)!=0;
        __lastLabel__ = 63; __label__ = 64; break;
      case 64: // $249
        var $250=__lastLabel__ == 62 ? 0 : ($248);
        if ($250) { __label__ = 65; break; } else { __label__ = 66; break; }
      case 65: // $251
        var $252=HEAP[$title_e];
        var $253=(($252) + -1)&4294967295;
        HEAP[$title_e]=$253;
        __label__ = 62; break;
      case 66: // $254
        var $255=HEAP[$title_e];
        var $256=HEAP[$3];
        var $257=($256+$255)&4294967295;
        var $258=HEAP[$257];
        var $259=reSign(($258), 8, 0);
        var $260=((($259))|0)!=39;
        if ($260) { __label__ = 67; break; } else { __label__ = 68; break; }
      case 67: // $261
        var $262=HEAP[$title_e];
        var $263=HEAP[$3];
        var $264=($263+$262)&4294967295;
        var $265=HEAP[$264];
        var $266=reSign(($265), 8, 0);
        var $267=((($266))|0)!=34;
        if ($267) { __label__ = 69; break; } else { __label__ = 68; break; }
      case 69: // $268
        HEAP[$title_e]=0;
        HEAP[$title_b]=0;
        var $269=HEAP[$i];
        HEAP[$link_e]=$269;
        __label__ = 68; break;
      case 68: // $270
        __label__ = 54; break;
      case 54: // $271
        __label__ = 70; break;
      case 70: // $272
        var $273=HEAP[$link_e];
        var $274=HEAP[$link_b];
        var $275=unSign(($273), 32, 0) > unSign(($274), 32, 0);
        if ($275) { __lastLabel__ = 70; __label__ = 71; break; } else { __lastLabel__ = 70; __label__ = 72; break; }
      case 71: // $276
        var $277=HEAP[$link_e];
        var $278=(($277) - 1)&4294967295;
        var $279=HEAP[$3];
        var $280=($279+$278)&4294967295;
        var $281=HEAP[$280];
        var $282=reSign(($281), 8, 0);
        var $283=((($282))|0)==32;
        if ($283) { __lastLabel__ = 71; __label__ = 73; break; } else { __lastLabel__ = 71; __label__ = 74; break; }
      case 74: // $284
        var $285=HEAP[$link_e];
        var $286=(($285) - 1)&4294967295;
        var $287=HEAP[$3];
        var $288=($287+$286)&4294967295;
        var $289=HEAP[$288];
        var $290=reSign(($289), 8, 0);
        var $291=((($290))|0)==9;
        __lastLabel__ = 74; __label__ = 73; break;
      case 73: // $292
        var $293=__lastLabel__ == 71 ? 1 : ($291);
        __lastLabel__ = 73; __label__ = 72; break;
      case 72: // $294
        var $295=__lastLabel__ == 70 ? 0 : ($293);
        if ($295) { __label__ = 75; break; } else { __label__ = 76; break; }
      case 75: // $296
        var $297=HEAP[$link_e];
        var $298=(($297) + -1)&4294967295;
        HEAP[$link_e]=$298;
        __label__ = 70; break;
      case 76: // $299
        var $300=HEAP[$link_b];
        var $301=HEAP[$3];
        var $302=($301+$300)&4294967295;
        var $303=HEAP[$302];
        var $304=reSign(($303), 8, 0);
        var $305=((($304))|0)==60;
        if ($305) { __label__ = 77; break; } else { __label__ = 78; break; }
      case 77: // $306
        var $307=HEAP[$link_b];
        var $308=(($307) + 1)&4294967295;
        HEAP[$link_b]=$308;
        __label__ = 78; break;
      case 78: // $309
        var $310=HEAP[$link_e];
        var $311=(($310) - 1)&4294967295;
        var $312=HEAP[$3];
        var $313=($312+$311)&4294967295;
        var $314=HEAP[$313];
        var $315=reSign(($314), 8, 0);
        var $316=((($315))|0)==62;
        if ($316) { __label__ = 79; break; } else { __label__ = 80; break; }
      case 79: // $317
        var $318=HEAP[$link_e];
        var $319=(($318) + -1)&4294967295;
        HEAP[$link_e]=$319;
        __label__ = 80; break;
      case 80: // $320
        var $321=HEAP[$link_e];
        var $322=HEAP[$link_b];
        var $323=unSign(($321), 32, 0) > unSign(($322), 32, 0);
        if ($323) { __label__ = 81; break; } else { __label__ = 82; break; }
      case 81: // $324
        var $325=HEAP[$2];
        var $326=_rndr_newbuf($325);
        HEAP[$link]=$326;
        var $327=HEAP[$link];
        var $328=HEAP[$3];
        var $329=HEAP[$link_b];
        var $330=($328+$329)&4294967295;
        var $331=HEAP[$link_e];
        var $332=HEAP[$link_b];
        var $333=(($331) - ($332))&4294967295;
        _bufput($327, $330, $333);
        __label__ = 82; break;
      case 82: // $334
        var $335=HEAP[$title_e];
        var $336=HEAP[$title_b];
        var $337=unSign(($335), 32, 0) > unSign(($336), 32, 0);
        if ($337) { __label__ = 83; break; } else { __label__ = 84; break; }
      case 83: // $338
        var $339=HEAP[$2];
        var $340=_rndr_newbuf($339);
        HEAP[$title]=$340;
        var $341=HEAP[$title];
        var $342=HEAP[$3];
        var $343=HEAP[$title_b];
        var $344=($342+$343)&4294967295;
        var $345=HEAP[$title_e];
        var $346=HEAP[$title_b];
        var $347=(($345) - ($346))&4294967295;
        _bufput($341, $344, $347);
        __label__ = 84; break;
      case 84: // $348
        var $349=HEAP[$i];
        var $350=(($349) + 1)&4294967295;
        HEAP[$i]=$350;
        __label__ = 85; break;
      case 34: // $351
        var $352=HEAP[$i];
        var $353=HEAP[$5];
        var $354=unSign(($352), 32, 0) < unSign(($353), 32, 0);
        if ($354) { __label__ = 86; break; } else { __label__ = 87; break; }
      case 86: // $355
        var $356=HEAP[$i];
        var $357=HEAP[$3];
        var $358=($357+$356)&4294967295;
        var $359=HEAP[$358];
        var $360=reSign(($359), 8, 0);
        var $361=((($360))|0)==91;
        if ($361) { __label__ = 88; break; } else { __label__ = 87; break; }
      case 88: // $362
        var $363=$id;
        _llvm_memset_p0i8_i32($363, 0, 20, 4, 0);
        var $364=HEAP[$i];
        var $365=(($364) + 1)&4294967295;
        HEAP[$i]=$365;
        var $366=HEAP[$i];
        HEAP[$link_b]=$366;
        __label__ = 89; break;
      case 89: // $367
        var $368=HEAP[$i];
        var $369=HEAP[$5];
        var $370=unSign(($368), 32, 0) < unSign(($369), 32, 0);
        if ($370) { __lastLabel__ = 89; __label__ = 90; break; } else { __lastLabel__ = 89; __label__ = 91; break; }
      case 90: // $371
        var $372=HEAP[$i];
        var $373=HEAP[$3];
        var $374=($373+$372)&4294967295;
        var $375=HEAP[$374];
        var $376=reSign(($375), 8, 0);
        var $377=((($376))|0)!=93;
        __lastLabel__ = 90; __label__ = 91; break;
      case 91: // $378
        var $379=__lastLabel__ == 89 ? 0 : ($377);
        if ($379) { __label__ = 92; break; } else { __label__ = 93; break; }
      case 92: // $380
        var $381=HEAP[$i];
        var $382=(($381) + 1)&4294967295;
        HEAP[$i]=$382;
        __label__ = 89; break;
      case 93: // $383
        var $384=HEAP[$i];
        var $385=HEAP[$5];
        var $386=unSign(($384), 32, 0) >= unSign(($385), 32, 0);
        if ($386) { __label__ = 94; break; } else { __label__ = 95; break; }
      case 94: // $387
        __label__ = 8; break;
      case 95: // $388
        var $389=HEAP[$i];
        HEAP[$link_e]=$389;
        var $390=HEAP[$link_b];
        var $391=HEAP[$link_e];
        var $392=((($390))|0)==((($391))|0);
        if ($392) { __label__ = 96; break; } else { __label__ = 97; break; }
      case 96: // $393
        var $394=HEAP[$text_has_nl];
        var $395=((($394))|0)!=0;
        if ($395) { __label__ = 98; break; } else { __label__ = 99; break; }
      case 98: // $396
        var $397=HEAP[$2];
        var $398=_rndr_newbuf($397);
        HEAP[$b]=$398;
        HEAP[$j]=1;
        __label__ = 100; break;
      case 100: // $399
        var $400=HEAP[$j];
        var $401=HEAP[$txt_e];
        var $402=unSign(($400), 32, 0) < unSign(($401), 32, 0);
        if ($402) { __label__ = 101; break; } else { __label__ = 102; break; }
      case 101: // $403
        var $404=HEAP[$j];
        var $405=HEAP[$3];
        var $406=($405+$404)&4294967295;
        var $407=HEAP[$406];
        var $408=reSign(($407), 8, 0);
        var $409=((($408))|0)!=10;
        if ($409) { __label__ = 103; break; } else { __label__ = 104; break; }
      case 103: // $410
        var $411=HEAP[$b];
        var $412=HEAP[$j];
        var $413=HEAP[$3];
        var $414=($413+$412)&4294967295;
        var $415=HEAP[$414];
        _bufputc($411, $415);
        __label__ = 105; break;
      case 104: // $416
        var $417=HEAP[$j];
        var $418=(($417) - 1)&4294967295;
        var $419=HEAP[$3];
        var $420=($419+$418)&4294967295;
        var $421=HEAP[$420];
        var $422=reSign(($421), 8, 0);
        var $423=((($422))|0)!=32;
        if ($423) { __label__ = 106; break; } else { __label__ = 107; break; }
      case 106: // $424
        var $425=HEAP[$b];
        _bufputc($425, 32);
        __label__ = 107; break;
      case 107: // $426
        __label__ = 105; break;
      case 105: // $427
        __label__ = 108; break;
      case 108: // $428
        var $429=HEAP[$j];
        var $430=(($429) + 1)&4294967295;
        HEAP[$j]=$430;
        __label__ = 100; break;
      case 102: // $431
        var $432=HEAP[$b];
        var $433=($432)&4294967295;
        var $434=HEAP[$433];
        var $435=($id)&4294967295;
        HEAP[$435]=$434;
        var $436=HEAP[$b];
        var $437=($436+4)&4294967295;
        var $438=HEAP[$437];
        var $439=($id+4)&4294967295;
        HEAP[$439]=$438;
        __label__ = 109; break;
      case 99: // $440
        var $441=HEAP[$3];
        var $442=($441+1)&4294967295;
        var $443=($id)&4294967295;
        HEAP[$443]=$442;
        var $444=HEAP[$txt_e];
        var $445=(($444) - 1)&4294967295;
        var $446=($id+4)&4294967295;
        HEAP[$446]=$445;
        __label__ = 109; break;
      case 109: // $447
        __label__ = 110; break;
      case 97: // $448
        var $449=HEAP[$3];
        var $450=HEAP[$link_b];
        var $451=($449+$450)&4294967295;
        var $452=($id)&4294967295;
        HEAP[$452]=$451;
        var $453=HEAP[$link_e];
        var $454=HEAP[$link_b];
        var $455=(($453) - ($454))&4294967295;
        var $456=($id+4)&4294967295;
        HEAP[$456]=$455;
        __label__ = 110; break;
      case 110: // $457
        var $458=HEAP[$2];
        var $459=($458+100)&4294967295;
        var $460=$id;
        var $461=_arr_sorted_find($459, $460, 20);
        var $462=$461;
        HEAP[$lr]=$462;
        var $463=HEAP[$lr];
        var $464=($463)!=0;
        if ($464) { __label__ = 111; break; } else { __label__ = 112; break; }
      case 112: // $465
        __label__ = 8; break;
      case 111: // $466
        var $467=HEAP[$lr];
        var $468=($467+4)&4294967295;
        var $469=HEAP[$468];
        HEAP[$link]=$469;
        var $470=HEAP[$lr];
        var $471=($470+8)&4294967295;
        var $472=HEAP[$471];
        HEAP[$title]=$472;
        var $473=HEAP[$i];
        var $474=(($473) + 1)&4294967295;
        HEAP[$i]=$474;
        __label__ = 113; break;
      case 87: // $475
        var $476=$id1;
        _llvm_memset_p0i8_i32($476, 0, 20, 4, 0);
        var $477=HEAP[$text_has_nl];
        var $478=((($477))|0)!=0;
        if ($478) { __label__ = 114; break; } else { __label__ = 115; break; }
      case 114: // $479
        var $480=HEAP[$2];
        var $481=_rndr_newbuf($480);
        HEAP[$b3]=$481;
        HEAP[$j4]=1;
        __label__ = 116; break;
      case 116: // $482
        var $483=HEAP[$j4];
        var $484=HEAP[$txt_e];
        var $485=unSign(($483), 32, 0) < unSign(($484), 32, 0);
        if ($485) { __label__ = 117; break; } else { __label__ = 118; break; }
      case 117: // $486
        var $487=HEAP[$j4];
        var $488=HEAP[$3];
        var $489=($488+$487)&4294967295;
        var $490=HEAP[$489];
        var $491=reSign(($490), 8, 0);
        var $492=((($491))|0)!=10;
        if ($492) { __label__ = 119; break; } else { __label__ = 120; break; }
      case 119: // $493
        var $494=HEAP[$b3];
        var $495=HEAP[$j4];
        var $496=HEAP[$3];
        var $497=($496+$495)&4294967295;
        var $498=HEAP[$497];
        _bufputc($494, $498);
        __label__ = 121; break;
      case 120: // $499
        var $500=HEAP[$j4];
        var $501=(($500) - 1)&4294967295;
        var $502=HEAP[$3];
        var $503=($502+$501)&4294967295;
        var $504=HEAP[$503];
        var $505=reSign(($504), 8, 0);
        var $506=((($505))|0)!=32;
        if ($506) { __label__ = 122; break; } else { __label__ = 123; break; }
      case 122: // $507
        var $508=HEAP[$b3];
        _bufputc($508, 32);
        __label__ = 123; break;
      case 123: // $509
        __label__ = 121; break;
      case 121: // $510
        __label__ = 124; break;
      case 124: // $511
        var $512=HEAP[$j4];
        var $513=(($512) + 1)&4294967295;
        HEAP[$j4]=$513;
        __label__ = 116; break;
      case 118: // $514
        var $515=HEAP[$b3];
        var $516=($515)&4294967295;
        var $517=HEAP[$516];
        var $518=($id1)&4294967295;
        HEAP[$518]=$517;
        var $519=HEAP[$b3];
        var $520=($519+4)&4294967295;
        var $521=HEAP[$520];
        var $522=($id1+4)&4294967295;
        HEAP[$522]=$521;
        __label__ = 125; break;
      case 115: // $523
        var $524=HEAP[$3];
        var $525=($524+1)&4294967295;
        var $526=($id1)&4294967295;
        HEAP[$526]=$525;
        var $527=HEAP[$txt_e];
        var $528=(($527) - 1)&4294967295;
        var $529=($id1+4)&4294967295;
        HEAP[$529]=$528;
        __label__ = 125; break;
      case 125: // $530
        var $531=HEAP[$2];
        var $532=($531+100)&4294967295;
        var $533=$id1;
        var $534=_arr_sorted_find($532, $533, 20);
        var $535=$534;
        HEAP[$lr2]=$535;
        var $536=HEAP[$lr2];
        var $537=($536)!=0;
        if ($537) { __label__ = 126; break; } else { __label__ = 127; break; }
      case 127: // $538
        __label__ = 8; break;
      case 126: // $539
        var $540=HEAP[$lr2];
        var $541=($540+4)&4294967295;
        var $542=HEAP[$541];
        HEAP[$link]=$542;
        var $543=HEAP[$lr2];
        var $544=($543+8)&4294967295;
        var $545=HEAP[$544];
        HEAP[$title]=$545;
        var $546=HEAP[$txt_e];
        var $547=(($546) + 1)&4294967295;
        HEAP[$i]=$547;
        __label__ = 113; break;
      case 113: // $548
        __label__ = 85; break;
      case 85: // $549
        var $550=HEAP[$txt_e];
        var $551=unSign(($550), 32, 0) > 1;
        if ($551) { __label__ = 128; break; } else { __label__ = 129; break; }
      case 128: // $552
        var $553=HEAP[$2];
        var $554=_rndr_newbuf($553);
        HEAP[$content]=$554;
        var $555=HEAP[$is_img];
        var $556=((($555))|0)!=0;
        if ($556) { __label__ = 130; break; } else { __label__ = 131; break; }
      case 130: // $557
        var $558=HEAP[$content];
        var $559=HEAP[$3];
        var $560=($559+1)&4294967295;
        var $561=HEAP[$txt_e];
        var $562=(($561) - 1)&4294967295;
        _bufput($558, $560, $562);
        __label__ = 132; break;
      case 131: // $563
        var $564=HEAP[$content];
        var $565=HEAP[$2];
        var $566=HEAP[$3];
        var $567=($566+1)&4294967295;
        var $568=HEAP[$txt_e];
        var $569=(($568) - 1)&4294967295;
        _parse_inline($564, $565, $567, $569);
        __label__ = 132; break;
      case 132: // $570
        __label__ = 129; break;
      case 129: // $571
        var $572=HEAP[$is_img];
        var $573=((($572))|0)!=0;
        if ($573) { __label__ = 133; break; } else { __label__ = 134; break; }
      case 133: // $574
        var $575=HEAP[$1];
        var $576=($575+4)&4294967295;
        var $577=HEAP[$576];
        var $578=((($577))|0)!=0;
        if ($578) { __label__ = 135; break; } else { __label__ = 136; break; }
      case 135: // $579
        var $580=HEAP[$1];
        var $581=($580+4)&4294967295;
        var $582=HEAP[$581];
        var $583=(($582) - 1)&4294967295;
        var $584=HEAP[$1];
        var $585=($584)&4294967295;
        var $586=HEAP[$585];
        var $587=($586+$583)&4294967295;
        var $588=HEAP[$587];
        var $589=reSign(($588), 8, 0);
        var $590=((($589))|0)==33;
        if ($590) { __label__ = 137; break; } else { __label__ = 136; break; }
      case 137: // $591
        var $592=HEAP[$1];
        var $593=($592+4)&4294967295;
        var $594=HEAP[$593];
        var $595=(($594) - 1)&4294967295;
        HEAP[$593]=$595;
        __label__ = 136; break;
      case 136: // $596
        var $597=HEAP[$2];
        var $598=($597)&4294967295;
        var $599=($598+60)&4294967295;
        var $600=HEAP[$599];
        var $601=HEAP[$1];
        var $602=HEAP[$link];
        var $603=HEAP[$title];
        var $604=HEAP[$content];
        var $605=HEAP[$2];
        var $606=($605)&4294967295;
        var $607=($606+96)&4294967295;
        var $608=HEAP[$607];
        var $609=FUNCTION_TABLE[$600]($601, $602, $603, $604, $608);
        HEAP[$ret]=$609;
        __label__ = 138; break;
      case 134: // $610
        var $611=HEAP[$2];
        var $612=($611)&4294967295;
        var $613=($612+68)&4294967295;
        var $614=HEAP[$613];
        var $615=HEAP[$1];
        var $616=HEAP[$link];
        var $617=HEAP[$title];
        var $618=HEAP[$content];
        var $619=HEAP[$2];
        var $620=($619)&4294967295;
        var $621=($620+96)&4294967295;
        var $622=HEAP[$621];
        var $623=FUNCTION_TABLE[$614]($615, $616, $617, $618, $622);
        HEAP[$ret]=$623;
        __label__ = 138; break;
      case 138: // $624
        __label__ = 8; break;
      case 8: // $625
        var $626=HEAP[$org_work_size];
        var $627=HEAP[$2];
        var $628=($627+1140)&4294967295;
        var $629=($628+4)&4294967295;
        HEAP[$629]=$626;
        var $630=HEAP[$ret];
        var $631=((($630))|0)!=0;
        if ($631) { __label__ = 139; break; } else { __label__ = 140; break; }
      case 139: // $632
        var $633=HEAP[$i];
        __lastLabel__ = 139; __label__ = 141; break;
      case 140: // $634
        __lastLabel__ = 140; __label__ = 141; break;
      case 141: // $635
        var $636=__lastLabel__ == 139 ? $633 : (0);
        STACKTOP = __stackBase__;
        return $636;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _char_langle_tag($ob, $rndr, $data, $offset, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 56; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 56);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $6=__stackBase__+20;
        var $altype=__stackBase__+24;
        var $end=__stackBase__+28;
        var $work=__stackBase__+32;
        var $ret=__stackBase__+52;
        HEAP[$2]=$ob;
        HEAP[$3]=$rndr;
        HEAP[$4]=$data;
        HEAP[$5]=$offset;
        HEAP[$6]=$size;
        HEAP[$altype]=0;
        var $7=HEAP[$4];
        var $8=HEAP[$6];
        var $9=_tag_length($7, $8, $altype);
        HEAP[$end]=$9;
        var $10=($work)&4294967295;
        var $11=HEAP[$4];
        HEAP[$10]=$11;
        var $12=($work+4)&4294967295;
        var $13=HEAP[$end];
        HEAP[$12]=$13;
        var $14=($work+8)&4294967295;
        HEAP[$14]=0;
        var $15=($work+12)&4294967295;
        HEAP[$15]=0;
        var $16=($work+16)&4294967295;
        HEAP[$16]=0;
        HEAP[$ret]=0;
        var $17=HEAP[$end];
        var $18=unSign(($17), 32, 0) > 2;
        if ($18) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $19
        var $20=HEAP[$3];
        var $21=($20)&4294967295;
        var $22=($21+44)&4294967295;
        var $23=HEAP[$22];
        var $24=($23)!=0;
        if ($24) { __label__ = 2; break; } else { __label__ = 3; break; }
      case 2: // $25
        var $26=HEAP[$altype];
        var $27=((($26))|0)!=0;
        if ($27) { __label__ = 4; break; } else { __label__ = 3; break; }
      case 4: // $28
        var $29=HEAP[$4];
        var $30=($29+1)&4294967295;
        var $31=($work)&4294967295;
        HEAP[$31]=$30;
        var $32=HEAP[$end];
        var $33=(($32) - 2)&4294967295;
        var $34=($work+4)&4294967295;
        HEAP[$34]=$33;
        var $35=HEAP[$3];
        var $36=($35)&4294967295;
        var $37=($36+44)&4294967295;
        var $38=HEAP[$37];
        var $39=HEAP[$2];
        var $40=HEAP[$altype];
        var $41=HEAP[$3];
        var $42=($41)&4294967295;
        var $43=($42+96)&4294967295;
        var $44=HEAP[$43];
        var $45=FUNCTION_TABLE[$38]($39, $work, $40, $44);
        HEAP[$ret]=$45;
        __label__ = 5; break;
      case 3: // $46
        var $47=HEAP[$3];
        var $48=($47)&4294967295;
        var $49=($48+72)&4294967295;
        var $50=HEAP[$49];
        var $51=($50)!=0;
        if ($51) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $52
        var $53=HEAP[$3];
        var $54=($53)&4294967295;
        var $55=($54+72)&4294967295;
        var $56=HEAP[$55];
        var $57=HEAP[$2];
        var $58=HEAP[$3];
        var $59=($58)&4294967295;
        var $60=($59+96)&4294967295;
        var $61=HEAP[$60];
        var $62=FUNCTION_TABLE[$56]($57, $work, $61);
        HEAP[$ret]=$62;
        __label__ = 7; break;
      case 7: // $63
        __label__ = 5; break;
      case 5: // $64
        __label__ = 1; break;
      case 1: // $65
        var $66=HEAP[$ret];
        var $67=((($66))|0)!=0;
        if ($67) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 9: // $68
        HEAP[$1]=0;
        __label__ = 10; break;
      case 8: // $69
        var $70=HEAP[$end];
        HEAP[$1]=$70;
        __label__ = 10; break;
      case 10: // $71
        var $72=HEAP[$1];
        STACKTOP = __stackBase__;
        return $72;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _char_escape($ob, $rndr, $data, $offset, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 40; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 40);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $work=__stackBase__+20;
        HEAP[$1]=$ob;
        HEAP[$2]=$rndr;
        HEAP[$3]=$data;
        HEAP[$4]=$offset;
        HEAP[$5]=$size;
        var $6=$work;
        _llvm_memset_p0i8_i32($6, 0, 20, 4, 0);
        var $7=HEAP[$5];
        var $8=unSign(($7), 32, 0) > 1;
        if ($8) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $9
        var $10=HEAP[$2];
        var $11=($10)&4294967295;
        var $12=($11+84)&4294967295;
        var $13=HEAP[$12];
        var $14=($13)!=0;
        if ($14) { __label__ = 2; break; } else { __label__ = 3; break; }
      case 2: // $15
        var $16=HEAP[$3];
        var $17=($16+1)&4294967295;
        var $18=($work)&4294967295;
        HEAP[$18]=$17;
        var $19=($work+4)&4294967295;
        HEAP[$19]=1;
        var $20=HEAP[$2];
        var $21=($20)&4294967295;
        var $22=($21+84)&4294967295;
        var $23=HEAP[$22];
        var $24=HEAP[$1];
        var $25=HEAP[$2];
        var $26=($25)&4294967295;
        var $27=($26+96)&4294967295;
        var $28=HEAP[$27];
        FUNCTION_TABLE[$23]($24, $work, $28);
        __label__ = 4; break;
      case 3: // $29
        var $30=HEAP[$1];
        var $31=HEAP[$3];
        var $32=($31+1)&4294967295;
        var $33=HEAP[$32];
        _bufputc($30, $33);
        __label__ = 4; break;
      case 4: // $34
        __label__ = 1; break;
      case 1: // $35
        STACKTOP = __stackBase__;
        return 2;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _char_entity($ob, $rndr, $data, $offset, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 48; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 48);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $6=__stackBase__+20;
        var $end=__stackBase__+24;
        var $work=__stackBase__+28;
        HEAP[$2]=$ob;
        HEAP[$3]=$rndr;
        HEAP[$4]=$data;
        HEAP[$5]=$offset;
        HEAP[$6]=$size;
        HEAP[$end]=1;
        var $7=HEAP[$end];
        var $8=HEAP[$6];
        var $9=unSign(($7), 32, 0) < unSign(($8), 32, 0);
        if ($9) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $10
        var $11=HEAP[$end];
        var $12=HEAP[$4];
        var $13=($12+$11)&4294967295;
        var $14=HEAP[$13];
        var $15=reSign(($14), 8, 0);
        var $16=((($15))|0)==35;
        if ($16) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 2: // $17
        var $18=HEAP[$end];
        var $19=(($18) + 1)&4294967295;
        HEAP[$end]=$19;
        __label__ = 1; break;
      case 1: // $20
        __label__ = 3; break;
      case 3: // $21
        var $22=HEAP[$end];
        var $23=HEAP[$6];
        var $24=unSign(($22), 32, 0) < unSign(($23), 32, 0);
        if ($24) { __lastLabel__ = 3; __label__ = 4; break; } else { __lastLabel__ = 3; __label__ = 5; break; }
      case 4: // $25
        var $26=HEAP[$end];
        var $27=HEAP[$4];
        var $28=($27+$26)&4294967295;
        var $29=HEAP[$28];
        var $30=reSign(($29), 8, 0);
        var $31=_isalnum($30);
        var $32=((($31))|0)!=0;
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $33
        var $34=__lastLabel__ == 3 ? 0 : ($32);
        if ($34) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $35
        var $36=HEAP[$end];
        var $37=(($36) + 1)&4294967295;
        HEAP[$end]=$37;
        __label__ = 3; break;
      case 7: // $38
        var $39=HEAP[$end];
        var $40=HEAP[$6];
        var $41=unSign(($39), 32, 0) < unSign(($40), 32, 0);
        if ($41) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $42
        var $43=HEAP[$end];
        var $44=HEAP[$4];
        var $45=($44+$43)&4294967295;
        var $46=HEAP[$45];
        var $47=reSign(($46), 8, 0);
        var $48=((($47))|0)==59;
        if ($48) { __label__ = 10; break; } else { __label__ = 9; break; }
      case 10: // $49
        var $50=HEAP[$end];
        var $51=(($50) + 1)&4294967295;
        HEAP[$end]=$51;
        __label__ = 11; break;
      case 9: // $52
        HEAP[$1]=0;
        __label__ = 12; break;
      case 11: // $53
        var $54=HEAP[$3];
        var $55=($54)&4294967295;
        var $56=($55+80)&4294967295;
        var $57=HEAP[$56];
        var $58=($57)!=0;
        if ($58) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $59
        var $60=HEAP[$4];
        var $61=($work)&4294967295;
        HEAP[$61]=$60;
        var $62=HEAP[$end];
        var $63=($work+4)&4294967295;
        HEAP[$63]=$62;
        var $64=HEAP[$3];
        var $65=($64)&4294967295;
        var $66=($65+80)&4294967295;
        var $67=HEAP[$66];
        var $68=HEAP[$2];
        var $69=HEAP[$3];
        var $70=($69)&4294967295;
        var $71=($70+96)&4294967295;
        var $72=HEAP[$71];
        FUNCTION_TABLE[$67]($68, $work, $72);
        __label__ = 15; break;
      case 14: // $73
        var $74=HEAP[$2];
        var $75=HEAP[$4];
        var $76=HEAP[$end];
        _bufput($74, $75, $76);
        __label__ = 15; break;
      case 15: // $77
        var $78=HEAP[$end];
        HEAP[$1]=$78;
        __label__ = 12; break;
      case 12: // $79
        var $80=HEAP[$1];
        STACKTOP = __stackBase__;
        return $80;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _char_autolink($ob, $rndr, $data, $offset, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 44; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 44);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $6=__stackBase__+20;
        var $work=__stackBase__+24;
        HEAP[$2]=$ob;
        HEAP[$3]=$rndr;
        HEAP[$4]=$data;
        HEAP[$5]=$offset;
        HEAP[$6]=$size;
        var $7=($work)&4294967295;
        var $8=HEAP[$4];
        HEAP[$7]=$8;
        var $9=($work+4)&4294967295;
        HEAP[$9]=0;
        var $10=($work+8)&4294967295;
        HEAP[$10]=0;
        var $11=($work+12)&4294967295;
        HEAP[$11]=0;
        var $12=($work+16)&4294967295;
        HEAP[$12]=0;
        var $13=HEAP[$5];
        var $14=unSign(($13), 32, 0) > 0;
        if ($14) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $15
        var $16=HEAP[$4];
        var $17=($16+-1)&4294967295;
        var $18=HEAP[$17];
        var $19=reSign(($18), 8, 0);
        var $20=_isspace($19);
        var $21=((($20))|0)!=0;
        if ($21) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 2: // $22
        HEAP[$1]=0;
        __label__ = 3; break;
      case 1: // $23
        var $24=HEAP[$4];
        var $25=HEAP[$6];
        var $26=_is_safe_link($24, $25);
        var $27=((($26))|0)!=0;
        if ($27) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 5: // $28
        HEAP[$1]=0;
        __label__ = 3; break;
      case 4: // $29
        __label__ = 6; break;
      case 6: // $30
        var $31=($work+4)&4294967295;
        var $32=HEAP[$31];
        var $33=HEAP[$6];
        var $34=unSign(($32), 32, 0) < unSign(($33), 32, 0);
        if ($34) { __lastLabel__ = 6; __label__ = 7; break; } else { __lastLabel__ = 6; __label__ = 8; break; }
      case 7: // $35
        var $36=($work+4)&4294967295;
        var $37=HEAP[$36];
        var $38=HEAP[$4];
        var $39=($38+$37)&4294967295;
        var $40=HEAP[$39];
        var $41=reSign(($40), 8, 0);
        var $42=_isspace($41);
        var $43=((($42))|0)!=0;
        var $44=($43) ^ 1;
        __lastLabel__ = 7; __label__ = 8; break;
      case 8: // $45
        var $46=__lastLabel__ == 6 ? 0 : ($44);
        if ($46) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $47
        var $48=($work+4)&4294967295;
        var $49=HEAP[$48];
        var $50=(($49) + 1)&4294967295;
        HEAP[$48]=$50;
        __label__ = 6; break;
      case 10: // $51
        var $52=HEAP[$3];
        var $53=($52)&4294967295;
        var $54=($53+44)&4294967295;
        var $55=HEAP[$54];
        var $56=($55)!=0;
        if ($56) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $57
        var $58=HEAP[$3];
        var $59=($58)&4294967295;
        var $60=($59+44)&4294967295;
        var $61=HEAP[$60];
        var $62=HEAP[$2];
        var $63=HEAP[$3];
        var $64=($63)&4294967295;
        var $65=($64+96)&4294967295;
        var $66=HEAP[$65];
        var $67=FUNCTION_TABLE[$61]($62, $work, 1, $66);
        __label__ = 12; break;
      case 12: // $68
        var $69=($work+4)&4294967295;
        var $70=HEAP[$69];
        HEAP[$1]=$70;
        __label__ = 3; break;
      case 3: // $71
        var $72=HEAP[$1];
        STACKTOP = __stackBase__;
        return $72;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _is_ref($data, $beg, $end, $last, $refs) {
    var __stackBase__  = STACKTOP; STACKTOP += 60; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 60);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $6=__stackBase__+20;
        var $i=__stackBase__+24;
        var $id_offset=__stackBase__+28;
        var $id_end=__stackBase__+32;
        var $link_offset=__stackBase__+36;
        var $link_end=__stackBase__+40;
        var $title_offset=__stackBase__+44;
        var $title_end=__stackBase__+48;
        var $line_end=__stackBase__+52;
        var $lr=__stackBase__+56;
        HEAP[$2]=$data;
        HEAP[$3]=$beg;
        HEAP[$4]=$end;
        HEAP[$5]=$last;
        HEAP[$6]=$refs;
        HEAP[$i]=0;
        var $7=HEAP[$3];
        var $8=(($7) + 3)&4294967295;
        var $9=HEAP[$4];
        var $10=unSign(($8), 32, 0) >= unSign(($9), 32, 0);
        if ($10) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $11
        HEAP[$1]=0;
        __label__ = 2; break;
      case 1: // $12
        var $13=HEAP[$3];
        var $14=HEAP[$2];
        var $15=($14+$13)&4294967295;
        var $16=HEAP[$15];
        var $17=reSign(($16), 8, 0);
        var $18=((($17))|0)==32;
        if ($18) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $19
        HEAP[$i]=1;
        var $20=HEAP[$3];
        var $21=(($20) + 1)&4294967295;
        var $22=HEAP[$2];
        var $23=($22+$21)&4294967295;
        var $24=HEAP[$23];
        var $25=reSign(($24), 8, 0);
        var $26=((($25))|0)==32;
        if ($26) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $27
        HEAP[$i]=2;
        var $28=HEAP[$3];
        var $29=(($28) + 2)&4294967295;
        var $30=HEAP[$2];
        var $31=($30+$29)&4294967295;
        var $32=HEAP[$31];
        var $33=reSign(($32), 8, 0);
        var $34=((($33))|0)==32;
        if ($34) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $35
        HEAP[$i]=3;
        var $36=HEAP[$3];
        var $37=(($36) + 3)&4294967295;
        var $38=HEAP[$2];
        var $39=($38+$37)&4294967295;
        var $40=HEAP[$39];
        var $41=reSign(($40), 8, 0);
        var $42=((($41))|0)==32;
        if ($42) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $43
        HEAP[$1]=0;
        __label__ = 2; break;
      case 10: // $44
        __label__ = 8; break;
      case 8: // $45
        __label__ = 6; break;
      case 6: // $46
        __label__ = 4; break;
      case 4: // $47
        var $48=HEAP[$3];
        var $49=HEAP[$i];
        var $50=(($49) + ($48))&4294967295;
        HEAP[$i]=$50;
        var $51=HEAP[$i];
        var $52=HEAP[$2];
        var $53=($52+$51)&4294967295;
        var $54=HEAP[$53];
        var $55=reSign(($54), 8, 0);
        var $56=((($55))|0)!=91;
        if ($56) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $57
        HEAP[$1]=0;
        __label__ = 2; break;
      case 12: // $58
        var $59=HEAP[$i];
        var $60=(($59) + 1)&4294967295;
        HEAP[$i]=$60;
        var $61=HEAP[$i];
        HEAP[$id_offset]=$61;
        __label__ = 13; break;
      case 13: // $62
        var $63=HEAP[$i];
        var $64=HEAP[$4];
        var $65=unSign(($63), 32, 0) < unSign(($64), 32, 0);
        if ($65) { __lastLabel__ = 13; __label__ = 14; break; } else { __lastLabel__ = 13; __label__ = 15; break; }
      case 14: // $66
        var $67=HEAP[$i];
        var $68=HEAP[$2];
        var $69=($68+$67)&4294967295;
        var $70=HEAP[$69];
        var $71=reSign(($70), 8, 0);
        var $72=((($71))|0)!=10;
        if ($72) { __lastLabel__ = 14; __label__ = 16; break; } else { __lastLabel__ = 14; __label__ = 15; break; }
      case 16: // $73
        var $74=HEAP[$i];
        var $75=HEAP[$2];
        var $76=($75+$74)&4294967295;
        var $77=HEAP[$76];
        var $78=reSign(($77), 8, 0);
        var $79=((($78))|0)!=13;
        if ($79) { __lastLabel__ = 16; __label__ = 17; break; } else { __lastLabel__ = 16; __label__ = 15; break; }
      case 17: // $80
        var $81=HEAP[$i];
        var $82=HEAP[$2];
        var $83=($82+$81)&4294967295;
        var $84=HEAP[$83];
        var $85=reSign(($84), 8, 0);
        var $86=((($85))|0)!=93;
        __lastLabel__ = 17; __label__ = 15; break;
      case 15: // $87
        var $88=__lastLabel__ == 16 ? 0 : (__lastLabel__ == 14 ? 0 : (__lastLabel__ == 13 ? 0 : ($86)));
        if ($88) { __label__ = 18; break; } else { __label__ = 19; break; }
      case 18: // $89
        var $90=HEAP[$i];
        var $91=(($90) + 1)&4294967295;
        HEAP[$i]=$91;
        __label__ = 13; break;
      case 19: // $92
        var $93=HEAP[$i];
        var $94=HEAP[$4];
        var $95=unSign(($93), 32, 0) >= unSign(($94), 32, 0);
        if ($95) { __label__ = 20; break; } else { __label__ = 21; break; }
      case 21: // $96
        var $97=HEAP[$i];
        var $98=HEAP[$2];
        var $99=($98+$97)&4294967295;
        var $100=HEAP[$99];
        var $101=reSign(($100), 8, 0);
        var $102=((($101))|0)!=93;
        if ($102) { __label__ = 20; break; } else { __label__ = 22; break; }
      case 20: // $103
        HEAP[$1]=0;
        __label__ = 2; break;
      case 22: // $104
        var $105=HEAP[$i];
        HEAP[$id_end]=$105;
        var $106=HEAP[$i];
        var $107=(($106) + 1)&4294967295;
        HEAP[$i]=$107;
        var $108=HEAP[$i];
        var $109=HEAP[$4];
        var $110=unSign(($108), 32, 0) >= unSign(($109), 32, 0);
        if ($110) { __label__ = 23; break; } else { __label__ = 24; break; }
      case 24: // $111
        var $112=HEAP[$i];
        var $113=HEAP[$2];
        var $114=($113+$112)&4294967295;
        var $115=HEAP[$114];
        var $116=reSign(($115), 8, 0);
        var $117=((($116))|0)!=58;
        if ($117) { __label__ = 23; break; } else { __label__ = 25; break; }
      case 23: // $118
        HEAP[$1]=0;
        __label__ = 2; break;
      case 25: // $119
        var $120=HEAP[$i];
        var $121=(($120) + 1)&4294967295;
        HEAP[$i]=$121;
        __label__ = 26; break;
      case 26: // $122
        var $123=HEAP[$i];
        var $124=HEAP[$4];
        var $125=unSign(($123), 32, 0) < unSign(($124), 32, 0);
        if ($125) { __lastLabel__ = 26; __label__ = 27; break; } else { __lastLabel__ = 26; __label__ = 28; break; }
      case 27: // $126
        var $127=HEAP[$i];
        var $128=HEAP[$2];
        var $129=($128+$127)&4294967295;
        var $130=HEAP[$129];
        var $131=reSign(($130), 8, 0);
        var $132=((($131))|0)==32;
        if ($132) { __lastLabel__ = 27; __label__ = 29; break; } else { __lastLabel__ = 27; __label__ = 30; break; }
      case 30: // $133
        var $134=HEAP[$i];
        var $135=HEAP[$2];
        var $136=($135+$134)&4294967295;
        var $137=HEAP[$136];
        var $138=reSign(($137), 8, 0);
        var $139=((($138))|0)==9;
        __lastLabel__ = 30; __label__ = 29; break;
      case 29: // $140
        var $141=__lastLabel__ == 27 ? 1 : ($139);
        __lastLabel__ = 29; __label__ = 28; break;
      case 28: // $142
        var $143=__lastLabel__ == 26 ? 0 : ($141);
        if ($143) { __label__ = 31; break; } else { __label__ = 32; break; }
      case 31: // $144
        var $145=HEAP[$i];
        var $146=(($145) + 1)&4294967295;
        HEAP[$i]=$146;
        __label__ = 26; break;
      case 32: // $147
        var $148=HEAP[$i];
        var $149=HEAP[$4];
        var $150=unSign(($148), 32, 0) < unSign(($149), 32, 0);
        if ($150) { __label__ = 33; break; } else { __label__ = 34; break; }
      case 33: // $151
        var $152=HEAP[$i];
        var $153=HEAP[$2];
        var $154=($153+$152)&4294967295;
        var $155=HEAP[$154];
        var $156=reSign(($155), 8, 0);
        var $157=((($156))|0)==10;
        if ($157) { __label__ = 35; break; } else { __label__ = 36; break; }
      case 36: // $158
        var $159=HEAP[$i];
        var $160=HEAP[$2];
        var $161=($160+$159)&4294967295;
        var $162=HEAP[$161];
        var $163=reSign(($162), 8, 0);
        var $164=((($163))|0)==13;
        if ($164) { __label__ = 35; break; } else { __label__ = 34; break; }
      case 35: // $165
        var $166=HEAP[$i];
        var $167=(($166) + 1)&4294967295;
        HEAP[$i]=$167;
        var $168=HEAP[$i];
        var $169=HEAP[$4];
        var $170=unSign(($168), 32, 0) < unSign(($169), 32, 0);
        if ($170) { __label__ = 37; break; } else { __label__ = 38; break; }
      case 37: // $171
        var $172=HEAP[$i];
        var $173=HEAP[$2];
        var $174=($173+$172)&4294967295;
        var $175=HEAP[$174];
        var $176=reSign(($175), 8, 0);
        var $177=((($176))|0)==13;
        if ($177) { __label__ = 39; break; } else { __label__ = 38; break; }
      case 39: // $178
        var $179=HEAP[$i];
        var $180=(($179) - 1)&4294967295;
        var $181=HEAP[$2];
        var $182=($181+$180)&4294967295;
        var $183=HEAP[$182];
        var $184=reSign(($183), 8, 0);
        var $185=((($184))|0)==10;
        if ($185) { __label__ = 40; break; } else { __label__ = 38; break; }
      case 40: // $186
        var $187=HEAP[$i];
        var $188=(($187) + 1)&4294967295;
        HEAP[$i]=$188;
        __label__ = 38; break;
      case 38: // $189
        __label__ = 34; break;
      case 34: // $190
        __label__ = 41; break;
      case 41: // $191
        var $192=HEAP[$i];
        var $193=HEAP[$4];
        var $194=unSign(($192), 32, 0) < unSign(($193), 32, 0);
        if ($194) { __lastLabel__ = 41; __label__ = 42; break; } else { __lastLabel__ = 41; __label__ = 43; break; }
      case 42: // $195
        var $196=HEAP[$i];
        var $197=HEAP[$2];
        var $198=($197+$196)&4294967295;
        var $199=HEAP[$198];
        var $200=reSign(($199), 8, 0);
        var $201=((($200))|0)==32;
        if ($201) { __lastLabel__ = 42; __label__ = 44; break; } else { __lastLabel__ = 42; __label__ = 45; break; }
      case 45: // $202
        var $203=HEAP[$i];
        var $204=HEAP[$2];
        var $205=($204+$203)&4294967295;
        var $206=HEAP[$205];
        var $207=reSign(($206), 8, 0);
        var $208=((($207))|0)==9;
        __lastLabel__ = 45; __label__ = 44; break;
      case 44: // $209
        var $210=__lastLabel__ == 42 ? 1 : ($208);
        __lastLabel__ = 44; __label__ = 43; break;
      case 43: // $211
        var $212=__lastLabel__ == 41 ? 0 : ($210);
        if ($212) { __label__ = 46; break; } else { __label__ = 47; break; }
      case 46: // $213
        var $214=HEAP[$i];
        var $215=(($214) + 1)&4294967295;
        HEAP[$i]=$215;
        __label__ = 41; break;
      case 47: // $216
        var $217=HEAP[$i];
        var $218=HEAP[$4];
        var $219=unSign(($217), 32, 0) >= unSign(($218), 32, 0);
        if ($219) { __label__ = 48; break; } else { __label__ = 49; break; }
      case 48: // $220
        HEAP[$1]=0;
        __label__ = 2; break;
      case 49: // $221
        var $222=HEAP[$i];
        var $223=HEAP[$2];
        var $224=($223+$222)&4294967295;
        var $225=HEAP[$224];
        var $226=reSign(($225), 8, 0);
        var $227=((($226))|0)==60;
        if ($227) { __label__ = 50; break; } else { __label__ = 51; break; }
      case 50: // $228
        var $229=HEAP[$i];
        var $230=(($229) + 1)&4294967295;
        HEAP[$i]=$230;
        __label__ = 51; break;
      case 51: // $231
        var $232=HEAP[$i];
        HEAP[$link_offset]=$232;
        __label__ = 52; break;
      case 52: // $233
        var $234=HEAP[$i];
        var $235=HEAP[$4];
        var $236=unSign(($234), 32, 0) < unSign(($235), 32, 0);
        if ($236) { __lastLabel__ = 52; __label__ = 53; break; } else { __lastLabel__ = 52; __label__ = 54; break; }
      case 53: // $237
        var $238=HEAP[$i];
        var $239=HEAP[$2];
        var $240=($239+$238)&4294967295;
        var $241=HEAP[$240];
        var $242=reSign(($241), 8, 0);
        var $243=((($242))|0)!=32;
        if ($243) { __lastLabel__ = 53; __label__ = 55; break; } else { __lastLabel__ = 53; __label__ = 54; break; }
      case 55: // $244
        var $245=HEAP[$i];
        var $246=HEAP[$2];
        var $247=($246+$245)&4294967295;
        var $248=HEAP[$247];
        var $249=reSign(($248), 8, 0);
        var $250=((($249))|0)!=9;
        if ($250) { __lastLabel__ = 55; __label__ = 56; break; } else { __lastLabel__ = 55; __label__ = 54; break; }
      case 56: // $251
        var $252=HEAP[$i];
        var $253=HEAP[$2];
        var $254=($253+$252)&4294967295;
        var $255=HEAP[$254];
        var $256=reSign(($255), 8, 0);
        var $257=((($256))|0)!=10;
        if ($257) { __lastLabel__ = 56; __label__ = 57; break; } else { __lastLabel__ = 56; __label__ = 54; break; }
      case 57: // $258
        var $259=HEAP[$i];
        var $260=HEAP[$2];
        var $261=($260+$259)&4294967295;
        var $262=HEAP[$261];
        var $263=reSign(($262), 8, 0);
        var $264=((($263))|0)!=13;
        __lastLabel__ = 57; __label__ = 54; break;
      case 54: // $265
        var $266=__lastLabel__ == 56 ? 0 : (__lastLabel__ == 55 ? 0 : (__lastLabel__ == 53 ? 0 : (__lastLabel__ == 52 ? 0 : ($264))));
        if ($266) { __label__ = 58; break; } else { __label__ = 59; break; }
      case 58: // $267
        var $268=HEAP[$i];
        var $269=(($268) + 1)&4294967295;
        HEAP[$i]=$269;
        __label__ = 52; break;
      case 59: // $270
        var $271=HEAP[$i];
        var $272=(($271) - 1)&4294967295;
        var $273=HEAP[$2];
        var $274=($273+$272)&4294967295;
        var $275=HEAP[$274];
        var $276=reSign(($275), 8, 0);
        var $277=((($276))|0)==62;
        if ($277) { __label__ = 60; break; } else { __label__ = 61; break; }
      case 60: // $278
        var $279=HEAP[$i];
        var $280=(($279) - 1)&4294967295;
        HEAP[$link_end]=$280;
        __label__ = 62; break;
      case 61: // $281
        var $282=HEAP[$i];
        HEAP[$link_end]=$282;
        __label__ = 62; break;
      case 62: // $283
        __label__ = 63; break;
      case 63: // $284
        var $285=HEAP[$i];
        var $286=HEAP[$4];
        var $287=unSign(($285), 32, 0) < unSign(($286), 32, 0);
        if ($287) { __lastLabel__ = 63; __label__ = 64; break; } else { __lastLabel__ = 63; __label__ = 65; break; }
      case 64: // $288
        var $289=HEAP[$i];
        var $290=HEAP[$2];
        var $291=($290+$289)&4294967295;
        var $292=HEAP[$291];
        var $293=reSign(($292), 8, 0);
        var $294=((($293))|0)==32;
        if ($294) { __lastLabel__ = 64; __label__ = 66; break; } else { __lastLabel__ = 64; __label__ = 67; break; }
      case 67: // $295
        var $296=HEAP[$i];
        var $297=HEAP[$2];
        var $298=($297+$296)&4294967295;
        var $299=HEAP[$298];
        var $300=reSign(($299), 8, 0);
        var $301=((($300))|0)==9;
        __lastLabel__ = 67; __label__ = 66; break;
      case 66: // $302
        var $303=__lastLabel__ == 64 ? 1 : ($301);
        __lastLabel__ = 66; __label__ = 65; break;
      case 65: // $304
        var $305=__lastLabel__ == 63 ? 0 : ($303);
        if ($305) { __label__ = 68; break; } else { __label__ = 69; break; }
      case 68: // $306
        var $307=HEAP[$i];
        var $308=(($307) + 1)&4294967295;
        HEAP[$i]=$308;
        __label__ = 63; break;
      case 69: // $309
        var $310=HEAP[$i];
        var $311=HEAP[$4];
        var $312=unSign(($310), 32, 0) < unSign(($311), 32, 0);
        if ($312) { __label__ = 70; break; } else { __label__ = 71; break; }
      case 70: // $313
        var $314=HEAP[$i];
        var $315=HEAP[$2];
        var $316=($315+$314)&4294967295;
        var $317=HEAP[$316];
        var $318=reSign(($317), 8, 0);
        var $319=((($318))|0)!=10;
        if ($319) { __label__ = 72; break; } else { __label__ = 71; break; }
      case 72: // $320
        var $321=HEAP[$i];
        var $322=HEAP[$2];
        var $323=($322+$321)&4294967295;
        var $324=HEAP[$323];
        var $325=reSign(($324), 8, 0);
        var $326=((($325))|0)!=13;
        if ($326) { __label__ = 73; break; } else { __label__ = 71; break; }
      case 73: // $327
        var $328=HEAP[$i];
        var $329=HEAP[$2];
        var $330=($329+$328)&4294967295;
        var $331=HEAP[$330];
        var $332=reSign(($331), 8, 0);
        var $333=((($332))|0)!=39;
        if ($333) { __label__ = 74; break; } else { __label__ = 71; break; }
      case 74: // $334
        var $335=HEAP[$i];
        var $336=HEAP[$2];
        var $337=($336+$335)&4294967295;
        var $338=HEAP[$337];
        var $339=reSign(($338), 8, 0);
        var $340=((($339))|0)!=34;
        if ($340) { __label__ = 75; break; } else { __label__ = 71; break; }
      case 75: // $341
        var $342=HEAP[$i];
        var $343=HEAP[$2];
        var $344=($343+$342)&4294967295;
        var $345=HEAP[$344];
        var $346=reSign(($345), 8, 0);
        var $347=((($346))|0)!=40;
        if ($347) { __label__ = 76; break; } else { __label__ = 71; break; }
      case 76: // $348
        HEAP[$1]=0;
        __label__ = 2; break;
      case 71: // $349
        HEAP[$line_end]=0;
        var $350=HEAP[$i];
        var $351=HEAP[$4];
        var $352=unSign(($350), 32, 0) >= unSign(($351), 32, 0);
        if ($352) { __label__ = 77; break; } else { __label__ = 78; break; }
      case 78: // $353
        var $354=HEAP[$i];
        var $355=HEAP[$2];
        var $356=($355+$354)&4294967295;
        var $357=HEAP[$356];
        var $358=reSign(($357), 8, 0);
        var $359=((($358))|0)==13;
        if ($359) { __label__ = 77; break; } else { __label__ = 79; break; }
      case 79: // $360
        var $361=HEAP[$i];
        var $362=HEAP[$2];
        var $363=($362+$361)&4294967295;
        var $364=HEAP[$363];
        var $365=reSign(($364), 8, 0);
        var $366=((($365))|0)==10;
        if ($366) { __label__ = 77; break; } else { __label__ = 80; break; }
      case 77: // $367
        var $368=HEAP[$i];
        HEAP[$line_end]=$368;
        __label__ = 80; break;
      case 80: // $369
        var $370=HEAP[$i];
        var $371=(($370) + 1)&4294967295;
        var $372=HEAP[$4];
        var $373=unSign(($371), 32, 0) < unSign(($372), 32, 0);
        if ($373) { __label__ = 81; break; } else { __label__ = 82; break; }
      case 81: // $374
        var $375=HEAP[$i];
        var $376=HEAP[$2];
        var $377=($376+$375)&4294967295;
        var $378=HEAP[$377];
        var $379=reSign(($378), 8, 0);
        var $380=((($379))|0)==10;
        if ($380) { __label__ = 83; break; } else { __label__ = 82; break; }
      case 83: // $381
        var $382=HEAP[$i];
        var $383=(($382) + 1)&4294967295;
        var $384=HEAP[$2];
        var $385=($384+$383)&4294967295;
        var $386=HEAP[$385];
        var $387=reSign(($386), 8, 0);
        var $388=((($387))|0)==13;
        if ($388) { __label__ = 84; break; } else { __label__ = 82; break; }
      case 84: // $389
        var $390=HEAP[$i];
        var $391=(($390) + 1)&4294967295;
        HEAP[$line_end]=$391;
        __label__ = 82; break;
      case 82: // $392
        var $393=HEAP[$line_end];
        var $394=((($393))|0)!=0;
        if ($394) { __label__ = 85; break; } else { __label__ = 86; break; }
      case 85: // $395
        var $396=HEAP[$line_end];
        var $397=(($396) + 1)&4294967295;
        HEAP[$i]=$397;
        __label__ = 87; break;
      case 87: // $398
        var $399=HEAP[$i];
        var $400=HEAP[$4];
        var $401=unSign(($399), 32, 0) < unSign(($400), 32, 0);
        if ($401) { __lastLabel__ = 87; __label__ = 88; break; } else { __lastLabel__ = 87; __label__ = 89; break; }
      case 88: // $402
        var $403=HEAP[$i];
        var $404=HEAP[$2];
        var $405=($404+$403)&4294967295;
        var $406=HEAP[$405];
        var $407=reSign(($406), 8, 0);
        var $408=((($407))|0)==32;
        if ($408) { __lastLabel__ = 88; __label__ = 90; break; } else { __lastLabel__ = 88; __label__ = 91; break; }
      case 91: // $409
        var $410=HEAP[$i];
        var $411=HEAP[$2];
        var $412=($411+$410)&4294967295;
        var $413=HEAP[$412];
        var $414=reSign(($413), 8, 0);
        var $415=((($414))|0)==9;
        __lastLabel__ = 91; __label__ = 90; break;
      case 90: // $416
        var $417=__lastLabel__ == 88 ? 1 : ($415);
        __lastLabel__ = 90; __label__ = 89; break;
      case 89: // $418
        var $419=__lastLabel__ == 87 ? 0 : ($417);
        if ($419) { __label__ = 92; break; } else { __label__ = 93; break; }
      case 92: // $420
        var $421=HEAP[$i];
        var $422=(($421) + 1)&4294967295;
        HEAP[$i]=$422;
        __label__ = 87; break;
      case 93: // $423
        __label__ = 86; break;
      case 86: // $424
        HEAP[$title_end]=0;
        HEAP[$title_offset]=0;
        var $425=HEAP[$i];
        var $426=(($425) + 1)&4294967295;
        var $427=HEAP[$4];
        var $428=unSign(($426), 32, 0) < unSign(($427), 32, 0);
        if ($428) { __label__ = 94; break; } else { __label__ = 95; break; }
      case 94: // $429
        var $430=HEAP[$i];
        var $431=HEAP[$2];
        var $432=($431+$430)&4294967295;
        var $433=HEAP[$432];
        var $434=reSign(($433), 8, 0);
        var $435=((($434))|0)==39;
        if ($435) { __label__ = 96; break; } else { __label__ = 97; break; }
      case 97: // $436
        var $437=HEAP[$i];
        var $438=HEAP[$2];
        var $439=($438+$437)&4294967295;
        var $440=HEAP[$439];
        var $441=reSign(($440), 8, 0);
        var $442=((($441))|0)==34;
        if ($442) { __label__ = 96; break; } else { __label__ = 98; break; }
      case 98: // $443
        var $444=HEAP[$i];
        var $445=HEAP[$2];
        var $446=($445+$444)&4294967295;
        var $447=HEAP[$446];
        var $448=reSign(($447), 8, 0);
        var $449=((($448))|0)==40;
        if ($449) { __label__ = 96; break; } else { __label__ = 95; break; }
      case 96: // $450
        var $451=HEAP[$i];
        var $452=(($451) + 1)&4294967295;
        HEAP[$i]=$452;
        var $453=HEAP[$i];
        HEAP[$title_offset]=$453;
        __label__ = 99; break;
      case 99: // $454
        var $455=HEAP[$i];
        var $456=HEAP[$4];
        var $457=unSign(($455), 32, 0) < unSign(($456), 32, 0);
        if ($457) { __lastLabel__ = 99; __label__ = 100; break; } else { __lastLabel__ = 99; __label__ = 101; break; }
      case 100: // $458
        var $459=HEAP[$i];
        var $460=HEAP[$2];
        var $461=($460+$459)&4294967295;
        var $462=HEAP[$461];
        var $463=reSign(($462), 8, 0);
        var $464=((($463))|0)!=10;
        if ($464) { __lastLabel__ = 100; __label__ = 102; break; } else { __lastLabel__ = 100; __label__ = 101; break; }
      case 102: // $465
        var $466=HEAP[$i];
        var $467=HEAP[$2];
        var $468=($467+$466)&4294967295;
        var $469=HEAP[$468];
        var $470=reSign(($469), 8, 0);
        var $471=((($470))|0)!=13;
        __lastLabel__ = 102; __label__ = 101; break;
      case 101: // $472
        var $473=__lastLabel__ == 100 ? 0 : (__lastLabel__ == 99 ? 0 : ($471));
        if ($473) { __label__ = 103; break; } else { __label__ = 104; break; }
      case 103: // $474
        var $475=HEAP[$i];
        var $476=(($475) + 1)&4294967295;
        HEAP[$i]=$476;
        __label__ = 99; break;
      case 104: // $477
        var $478=HEAP[$i];
        var $479=(($478) + 1)&4294967295;
        var $480=HEAP[$4];
        var $481=unSign(($479), 32, 0) < unSign(($480), 32, 0);
        if ($481) { __label__ = 105; break; } else { __label__ = 106; break; }
      case 105: // $482
        var $483=HEAP[$i];
        var $484=HEAP[$2];
        var $485=($484+$483)&4294967295;
        var $486=HEAP[$485];
        var $487=reSign(($486), 8, 0);
        var $488=((($487))|0)==10;
        if ($488) { __label__ = 107; break; } else { __label__ = 106; break; }
      case 107: // $489
        var $490=HEAP[$i];
        var $491=(($490) + 1)&4294967295;
        var $492=HEAP[$2];
        var $493=($492+$491)&4294967295;
        var $494=HEAP[$493];
        var $495=reSign(($494), 8, 0);
        var $496=((($495))|0)==13;
        if ($496) { __label__ = 108; break; } else { __label__ = 106; break; }
      case 108: // $497
        var $498=HEAP[$i];
        var $499=(($498) + 1)&4294967295;
        HEAP[$title_end]=$499;
        __label__ = 109; break;
      case 106: // $500
        var $501=HEAP[$i];
        HEAP[$title_end]=$501;
        __label__ = 109; break;
      case 109: // $502
        var $503=HEAP[$i];
        var $504=(($503) - 1)&4294967295;
        HEAP[$i]=$504;
        __label__ = 110; break;
      case 110: // $505
        var $506=HEAP[$i];
        var $507=HEAP[$title_offset];
        var $508=unSign(($506), 32, 0) > unSign(($507), 32, 0);
        if ($508) { __lastLabel__ = 110; __label__ = 111; break; } else { __lastLabel__ = 110; __label__ = 112; break; }
      case 111: // $509
        var $510=HEAP[$i];
        var $511=HEAP[$2];
        var $512=($511+$510)&4294967295;
        var $513=HEAP[$512];
        var $514=reSign(($513), 8, 0);
        var $515=((($514))|0)==32;
        if ($515) { __lastLabel__ = 111; __label__ = 113; break; } else { __lastLabel__ = 111; __label__ = 114; break; }
      case 114: // $516
        var $517=HEAP[$i];
        var $518=HEAP[$2];
        var $519=($518+$517)&4294967295;
        var $520=HEAP[$519];
        var $521=reSign(($520), 8, 0);
        var $522=((($521))|0)==9;
        __lastLabel__ = 114; __label__ = 113; break;
      case 113: // $523
        var $524=__lastLabel__ == 111 ? 1 : ($522);
        __lastLabel__ = 113; __label__ = 112; break;
      case 112: // $525
        var $526=__lastLabel__ == 110 ? 0 : ($524);
        if ($526) { __label__ = 115; break; } else { __label__ = 116; break; }
      case 115: // $527
        var $528=HEAP[$i];
        var $529=(($528) - 1)&4294967295;
        HEAP[$i]=$529;
        __label__ = 110; break;
      case 116: // $530
        var $531=HEAP[$i];
        var $532=HEAP[$title_offset];
        var $533=unSign(($531), 32, 0) > unSign(($532), 32, 0);
        if ($533) { __label__ = 117; break; } else { __label__ = 118; break; }
      case 117: // $534
        var $535=HEAP[$i];
        var $536=HEAP[$2];
        var $537=($536+$535)&4294967295;
        var $538=HEAP[$537];
        var $539=reSign(($538), 8, 0);
        var $540=((($539))|0)==39;
        if ($540) { __label__ = 119; break; } else { __label__ = 120; break; }
      case 120: // $541
        var $542=HEAP[$i];
        var $543=HEAP[$2];
        var $544=($543+$542)&4294967295;
        var $545=HEAP[$544];
        var $546=reSign(($545), 8, 0);
        var $547=((($546))|0)==34;
        if ($547) { __label__ = 119; break; } else { __label__ = 121; break; }
      case 121: // $548
        var $549=HEAP[$i];
        var $550=HEAP[$2];
        var $551=($550+$549)&4294967295;
        var $552=HEAP[$551];
        var $553=reSign(($552), 8, 0);
        var $554=((($553))|0)==41;
        if ($554) { __label__ = 119; break; } else { __label__ = 118; break; }
      case 119: // $555
        var $556=HEAP[$title_end];
        HEAP[$line_end]=$556;
        var $557=HEAP[$i];
        HEAP[$title_end]=$557;
        __label__ = 118; break;
      case 118: // $558
        __label__ = 95; break;
      case 95: // $559
        var $560=HEAP[$line_end];
        var $561=((($560))|0)!=0;
        if ($561) { __label__ = 122; break; } else { __label__ = 123; break; }
      case 123: // $562
        HEAP[$1]=0;
        __label__ = 2; break;
      case 122: // $563
        var $564=HEAP[$5];
        var $565=($564)!=0;
        if ($565) { __label__ = 124; break; } else { __label__ = 125; break; }
      case 124: // $566
        var $567=HEAP[$line_end];
        var $568=HEAP[$5];
        HEAP[$568]=$567;
        __label__ = 125; break;
      case 125: // $569
        var $570=HEAP[$6];
        var $571=($570)!=0;
        if ($571) { __label__ = 126; break; } else { __label__ = 127; break; }
      case 127: // $572
        HEAP[$1]=1;
        __label__ = 2; break;
      case 126: // $573
        var $574=HEAP[$6];
        var $575=HEAP[$6];
        var $576=_arr_newitem($575);
        var $577=_arr_item($574, $576);
        var $578=$577;
        HEAP[$lr]=$578;
        var $579=HEAP[$id_end];
        var $580=HEAP[$id_offset];
        var $581=(($579) - ($580))&4294967295;
        var $582=_bufnew($581);
        var $583=HEAP[$lr];
        var $584=($583)&4294967295;
        HEAP[$584]=$582;
        var $585=HEAP[$lr];
        var $586=($585)&4294967295;
        var $587=HEAP[$586];
        var $588=HEAP[$2];
        var $589=HEAP[$id_offset];
        var $590=($588+$589)&4294967295;
        var $591=HEAP[$id_end];
        var $592=HEAP[$id_offset];
        var $593=(($591) - ($592))&4294967295;
        _bufput($587, $590, $593);
        var $594=HEAP[$link_end];
        var $595=HEAP[$link_offset];
        var $596=(($594) - ($595))&4294967295;
        var $597=_bufnew($596);
        var $598=HEAP[$lr];
        var $599=($598+4)&4294967295;
        HEAP[$599]=$597;
        var $600=HEAP[$lr];
        var $601=($600+4)&4294967295;
        var $602=HEAP[$601];
        var $603=HEAP[$2];
        var $604=HEAP[$link_offset];
        var $605=($603+$604)&4294967295;
        var $606=HEAP[$link_end];
        var $607=HEAP[$link_offset];
        var $608=(($606) - ($607))&4294967295;
        _bufput($602, $605, $608);
        var $609=HEAP[$title_end];
        var $610=HEAP[$title_offset];
        var $611=unSign(($609), 32, 0) > unSign(($610), 32, 0);
        if ($611) { __label__ = 128; break; } else { __label__ = 129; break; }
      case 128: // $612
        var $613=HEAP[$title_end];
        var $614=HEAP[$title_offset];
        var $615=(($613) - ($614))&4294967295;
        var $616=_bufnew($615);
        var $617=HEAP[$lr];
        var $618=($617+8)&4294967295;
        HEAP[$618]=$616;
        var $619=HEAP[$lr];
        var $620=($619+8)&4294967295;
        var $621=HEAP[$620];
        var $622=HEAP[$2];
        var $623=HEAP[$title_offset];
        var $624=($622+$623)&4294967295;
        var $625=HEAP[$title_end];
        var $626=HEAP[$title_offset];
        var $627=(($625) - ($626))&4294967295;
        _bufput($621, $624, $627);
        __label__ = 130; break;
      case 129: // $628
        var $629=HEAP[$lr];
        var $630=($629+8)&4294967295;
        HEAP[$630]=0;
        __label__ = 130; break;
      case 130: // $631
        HEAP[$1]=1;
        __label__ = 2; break;
      case 2: // $632
        var $633=HEAP[$1];
        STACKTOP = __stackBase__;
        return $633;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _expand_tabs($ob, $line, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 24);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $i=__stackBase__+12;
        var $tab=__stackBase__+16;
        var $org=__stackBase__+20;
        HEAP[$1]=$ob;
        HEAP[$2]=$line;
        HEAP[$3]=$size;
        HEAP[$i]=0;
        HEAP[$tab]=0;
        __label__ = 0; break;
      case 0: // $4
        var $5=HEAP[$i];
        var $6=HEAP[$3];
        var $7=unSign(($5), 32, 0) < unSign(($6), 32, 0);
        if ($7) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $8
        var $9=HEAP[$i];
        HEAP[$org]=$9;
        __label__ = 3; break;
      case 3: // $10
        var $11=HEAP[$i];
        var $12=HEAP[$3];
        var $13=unSign(($11), 32, 0) < unSign(($12), 32, 0);
        if ($13) { __lastLabel__ = 3; __label__ = 4; break; } else { __lastLabel__ = 3; __label__ = 5; break; }
      case 4: // $14
        var $15=HEAP[$i];
        var $16=HEAP[$2];
        var $17=($16+$15)&4294967295;
        var $18=HEAP[$17];
        var $19=reSign(($18), 8, 0);
        var $20=((($19))|0)!=9;
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $21
        var $22=__lastLabel__ == 3 ? 0 : ($20);
        if ($22) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $23
        var $24=HEAP[$i];
        var $25=(($24) + 1)&4294967295;
        HEAP[$i]=$25;
        var $26=HEAP[$tab];
        var $27=(($26) + 1)&4294967295;
        HEAP[$tab]=$27;
        __label__ = 3; break;
      case 7: // $28
        var $29=HEAP[$i];
        var $30=HEAP[$org];
        var $31=unSign(($29), 32, 0) > unSign(($30), 32, 0);
        if ($31) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $32
        var $33=HEAP[$1];
        var $34=HEAP[$2];
        var $35=HEAP[$org];
        var $36=($34+$35)&4294967295;
        var $37=HEAP[$i];
        var $38=HEAP[$org];
        var $39=(($37) - ($38))&4294967295;
        _bufput($33, $36, $39);
        __label__ = 9; break;
      case 9: // $40
        var $41=HEAP[$i];
        var $42=HEAP[$3];
        var $43=unSign(($41), 32, 0) >= unSign(($42), 32, 0);
        if ($43) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $44
        __label__ = 2; break;
      case 11: // $45
        __label__ = 12; break;
      case 12: // $46
        var $47=HEAP[$1];
        _bufputc($47, 32);
        var $48=HEAP[$tab];
        var $49=(($48) + 1)&4294967295;
        HEAP[$tab]=$49;
        __label__ = 13; break;
      case 13: // $50
        var $51=HEAP[$tab];
        var $52=unSign(($51), 32, 0) % 4;
        var $53=((($52))|0)!=0;
        if ($53) { __label__ = 12; break; } else { __label__ = 14; break; }
      case 14: // $54
        var $55=HEAP[$i];
        var $56=(($55) + 1)&4294967295;
        HEAP[$i]=$56;
        __label__ = 0; break;
      case 2: // $57
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _cmp_link_ref_sort($a, $b) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 16);
    var __label__;
  
    var $1=__stackBase__;
    var $2=__stackBase__+4;
    var $lra=__stackBase__+8;
    var $lrb=__stackBase__+12;
    HEAP[$1]=$a;
    HEAP[$2]=$b;
    var $3=HEAP[$1];
    var $4=$3;
    HEAP[$lra]=$4;
    var $5=HEAP[$2];
    var $6=$5;
    HEAP[$lrb]=$6;
    var $7=HEAP[$lra];
    var $8=($7)&4294967295;
    var $9=HEAP[$8];
    var $10=HEAP[$lrb];
    var $11=($10)&4294967295;
    var $12=HEAP[$11];
    var $13=_bufcasecmp($9, $12);
    STACKTOP = __stackBase__;
    return $13;
  }
  

  function _parse_block($ob, $rndr, $data, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 32; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 32);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $beg=__stackBase__+16;
        var $end=__stackBase__+20;
        var $i=__stackBase__+24;
        var $txt_data=__stackBase__+28;
        HEAP[$1]=$ob;
        HEAP[$2]=$rndr;
        HEAP[$3]=$data;
        HEAP[$4]=$size;
        HEAP[$beg]=0;
        var $5=HEAP[$2];
        var $6=($5+1140)&4294967295;
        var $7=($6+4)&4294967295;
        var $8=HEAP[$7];
        var $9=HEAP[$2];
        var $10=($9+1156)&4294967295;
        var $11=HEAP[$10];
        var $12=unSign(($8), 32, 0) > unSign(($11), 32, 0);
        if ($12) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $13
        __label__ = 2; break;
      case 1: // $14
        __label__ = 3; break;
      case 3: // $15
        var $16=HEAP[$beg];
        var $17=HEAP[$4];
        var $18=unSign(($16), 32, 0) < unSign(($17), 32, 0);
        if ($18) { __label__ = 4; break; } else { __label__ = 2; break; }
      case 4: // $19
        var $20=HEAP[$3];
        var $21=HEAP[$beg];
        var $22=($20+$21)&4294967295;
        HEAP[$txt_data]=$22;
        var $23=HEAP[$4];
        var $24=HEAP[$beg];
        var $25=(($23) - ($24))&4294967295;
        HEAP[$end]=$25;
        var $26=HEAP[$beg];
        var $27=HEAP[$3];
        var $28=($27+$26)&4294967295;
        var $29=HEAP[$28];
        var $30=reSign(($29), 8, 0);
        var $31=((($30))|0)==35;
        if ($31) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $32
        var $33=HEAP[$1];
        var $34=HEAP[$2];
        var $35=HEAP[$txt_data];
        var $36=HEAP[$end];
        var $37=_parse_atxheader($33, $34, $35, $36);
        var $38=HEAP[$beg];
        var $39=(($38) + ($37))&4294967295;
        HEAP[$beg]=$39;
        __label__ = 7; break;
      case 6: // $40
        var $41=HEAP[$beg];
        var $42=HEAP[$3];
        var $43=($42+$41)&4294967295;
        var $44=HEAP[$43];
        var $45=reSign(($44), 8, 0);
        var $46=((($45))|0)==60;
        if ($46) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $47
        var $48=HEAP[$2];
        var $49=($48)&4294967295;
        var $50=($49+8)&4294967295;
        var $51=HEAP[$50];
        var $52=($51)!=0;
        if ($52) { __label__ = 10; break; } else { __label__ = 9; break; }
      case 10: // $53
        var $54=HEAP[$1];
        var $55=HEAP[$2];
        var $56=HEAP[$txt_data];
        var $57=HEAP[$end];
        var $58=_parse_htmlblock($54, $55, $56, $57, 1);
        HEAP[$i]=$58;
        var $59=((($58))|0)!=0;
        if ($59) { __label__ = 11; break; } else { __label__ = 9; break; }
      case 11: // $60
        var $61=HEAP[$i];
        var $62=HEAP[$beg];
        var $63=(($62) + ($61))&4294967295;
        HEAP[$beg]=$63;
        __label__ = 12; break;
      case 9: // $64
        var $65=HEAP[$txt_data];
        var $66=HEAP[$end];
        var $67=_is_empty($65, $66);
        HEAP[$i]=$67;
        var $68=((($67))|0)!=0;
        if ($68) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $69
        var $70=HEAP[$i];
        var $71=HEAP[$beg];
        var $72=(($71) + ($70))&4294967295;
        HEAP[$beg]=$72;
        __label__ = 15; break;
      case 14: // $73
        var $74=HEAP[$txt_data];
        var $75=HEAP[$end];
        var $76=_is_hrule($74, $75);
        var $77=((($76))|0)!=0;
        if ($77) { __label__ = 16; break; } else { __label__ = 17; break; }
      case 16: // $78
        var $79=HEAP[$2];
        var $80=($79)&4294967295;
        var $81=($80+16)&4294967295;
        var $82=HEAP[$81];
        var $83=($82)!=0;
        if ($83) { __label__ = 18; break; } else { __label__ = 19; break; }
      case 18: // $84
        var $85=HEAP[$2];
        var $86=($85)&4294967295;
        var $87=($86+16)&4294967295;
        var $88=HEAP[$87];
        var $89=HEAP[$1];
        var $90=HEAP[$2];
        var $91=($90)&4294967295;
        var $92=($91+96)&4294967295;
        var $93=HEAP[$92];
        FUNCTION_TABLE[$88]($89, $93);
        __label__ = 19; break;
      case 19: // $94
        __label__ = 20; break;
      case 20: // $95
        var $96=HEAP[$beg];
        var $97=HEAP[$4];
        var $98=unSign(($96), 32, 0) < unSign(($97), 32, 0);
        if ($98) { __lastLabel__ = 20; __label__ = 21; break; } else { __lastLabel__ = 20; __label__ = 22; break; }
      case 21: // $99
        var $100=HEAP[$beg];
        var $101=HEAP[$3];
        var $102=($101+$100)&4294967295;
        var $103=HEAP[$102];
        var $104=reSign(($103), 8, 0);
        var $105=((($104))|0)!=10;
        __lastLabel__ = 21; __label__ = 22; break;
      case 22: // $106
        var $107=__lastLabel__ == 20 ? 0 : ($105);
        if ($107) { __label__ = 23; break; } else { __label__ = 24; break; }
      case 23: // $108
        var $109=HEAP[$beg];
        var $110=(($109) + 1)&4294967295;
        HEAP[$beg]=$110;
        __label__ = 20; break;
      case 24: // $111
        var $112=HEAP[$beg];
        var $113=(($112) + 1)&4294967295;
        HEAP[$beg]=$113;
        __label__ = 25; break;
      case 17: // $114
        var $115=HEAP[$2];
        var $116=($115+1152)&4294967295;
        var $117=HEAP[$116];
        var $118=($117) & 4;
        var $119=((($118))|0)!=0;
        if ($119) { __label__ = 26; break; } else { __label__ = 27; break; }
      case 26: // $120
        var $121=HEAP[$1];
        var $122=HEAP[$2];
        var $123=HEAP[$txt_data];
        var $124=HEAP[$end];
        var $125=_parse_fencedcode($121, $122, $123, $124);
        HEAP[$i]=$125;
        var $126=((($125))|0)!=0;
        if ($126) { __label__ = 28; break; } else { __label__ = 27; break; }
      case 28: // $127
        var $128=HEAP[$i];
        var $129=HEAP[$beg];
        var $130=(($129) + ($128))&4294967295;
        HEAP[$beg]=$130;
        __label__ = 29; break;
      case 27: // $131
        var $132=HEAP[$2];
        var $133=($132+1152)&4294967295;
        var $134=HEAP[$133];
        var $135=($134) & 2;
        var $136=((($135))|0)!=0;
        if ($136) { __label__ = 30; break; } else { __label__ = 31; break; }
      case 30: // $137
        var $138=HEAP[$1];
        var $139=HEAP[$2];
        var $140=HEAP[$txt_data];
        var $141=HEAP[$end];
        var $142=_parse_table($138, $139, $140, $141);
        HEAP[$i]=$142;
        var $143=((($142))|0)!=0;
        if ($143) { __label__ = 32; break; } else { __label__ = 31; break; }
      case 32: // $144
        var $145=HEAP[$i];
        var $146=HEAP[$beg];
        var $147=(($146) + ($145))&4294967295;
        HEAP[$beg]=$147;
        __label__ = 33; break;
      case 31: // $148
        var $149=HEAP[$txt_data];
        var $150=HEAP[$end];
        var $151=_prefix_quote($149, $150);
        var $152=((($151))|0)!=0;
        if ($152) { __label__ = 34; break; } else { __label__ = 35; break; }
      case 34: // $153
        var $154=HEAP[$1];
        var $155=HEAP[$2];
        var $156=HEAP[$txt_data];
        var $157=HEAP[$end];
        var $158=_parse_blockquote($154, $155, $156, $157);
        var $159=HEAP[$beg];
        var $160=(($159) + ($158))&4294967295;
        HEAP[$beg]=$160;
        __label__ = 36; break;
      case 35: // $161
        var $162=HEAP[$txt_data];
        var $163=HEAP[$end];
        var $164=_prefix_code($162, $163);
        var $165=((($164))|0)!=0;
        if ($165) { __label__ = 37; break; } else { __label__ = 38; break; }
      case 37: // $166
        var $167=HEAP[$1];
        var $168=HEAP[$2];
        var $169=HEAP[$txt_data];
        var $170=HEAP[$end];
        var $171=_parse_blockcode($167, $168, $169, $170);
        var $172=HEAP[$beg];
        var $173=(($172) + ($171))&4294967295;
        HEAP[$beg]=$173;
        __label__ = 39; break;
      case 38: // $174
        var $175=HEAP[$txt_data];
        var $176=HEAP[$end];
        var $177=_prefix_uli($175, $176);
        var $178=((($177))|0)!=0;
        if ($178) { __label__ = 40; break; } else { __label__ = 41; break; }
      case 40: // $179
        var $180=HEAP[$1];
        var $181=HEAP[$2];
        var $182=HEAP[$txt_data];
        var $183=HEAP[$end];
        var $184=_parse_list($180, $181, $182, $183, 0);
        var $185=HEAP[$beg];
        var $186=(($185) + ($184))&4294967295;
        HEAP[$beg]=$186;
        __label__ = 42; break;
      case 41: // $187
        var $188=HEAP[$txt_data];
        var $189=HEAP[$end];
        var $190=_prefix_oli($188, $189);
        var $191=((($190))|0)!=0;
        if ($191) { __label__ = 43; break; } else { __label__ = 44; break; }
      case 43: // $192
        var $193=HEAP[$1];
        var $194=HEAP[$2];
        var $195=HEAP[$txt_data];
        var $196=HEAP[$end];
        var $197=_parse_list($193, $194, $195, $196, 1);
        var $198=HEAP[$beg];
        var $199=(($198) + ($197))&4294967295;
        HEAP[$beg]=$199;
        __label__ = 45; break;
      case 44: // $200
        var $201=HEAP[$1];
        var $202=HEAP[$2];
        var $203=HEAP[$txt_data];
        var $204=HEAP[$end];
        var $205=_parse_paragraph($201, $202, $203, $204);
        var $206=HEAP[$beg];
        var $207=(($206) + ($205))&4294967295;
        HEAP[$beg]=$207;
        __label__ = 45; break;
      case 45: // $208
        __label__ = 42; break;
      case 42: // $209
        __label__ = 39; break;
      case 39: // $210
        __label__ = 36; break;
      case 36: // $211
        __label__ = 33; break;
      case 33: // $212
        __label__ = 29; break;
      case 29: // $213
        __label__ = 25; break;
      case 25: // $214
        __label__ = 15; break;
      case 15: // $215
        __label__ = 12; break;
      case 12: // $216
        __label__ = 7; break;
      case 7: // $217
        __label__ = 3; break;
      case 2: // $218
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parse_atxheader($ob, $rndr, $data, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 40; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 40);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $level=__stackBase__+20;
        var $i=__stackBase__+24;
        var $end=__stackBase__+28;
        var $skip=__stackBase__+32;
        var $work=__stackBase__+36;
        HEAP[$2]=$ob;
        HEAP[$3]=$rndr;
        HEAP[$4]=$data;
        HEAP[$5]=$size;
        HEAP[$level]=0;
        var $6=HEAP[$5];
        var $7=((($6))|0)!=0;
        if ($7) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $8
        var $9=HEAP[$4];
        var $10=($9)&4294967295;
        var $11=HEAP[$10];
        var $12=reSign(($11), 8, 0);
        var $13=((($12))|0)!=35;
        if ($13) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $14
        HEAP[$1]=0;
        __label__ = 3; break;
      case 2: // $15
        __label__ = 4; break;
      case 4: // $16
        var $17=HEAP[$level];
        var $18=HEAP[$5];
        var $19=unSign(($17), 32, 0) < unSign(($18), 32, 0);
        if ($19) { __lastLabel__ = 4; __label__ = 5; break; } else { __lastLabel__ = 4; __label__ = 6; break; }
      case 5: // $20
        var $21=HEAP[$level];
        var $22=unSign(($21), 32, 0) < 6;
        if ($22) { __lastLabel__ = 5; __label__ = 7; break; } else { __lastLabel__ = 5; __label__ = 6; break; }
      case 7: // $23
        var $24=HEAP[$level];
        var $25=HEAP[$4];
        var $26=($25+$24)&4294967295;
        var $27=HEAP[$26];
        var $28=reSign(($27), 8, 0);
        var $29=((($28))|0)==35;
        __lastLabel__ = 7; __label__ = 6; break;
      case 6: // $30
        var $31=__lastLabel__ == 5 ? 0 : (__lastLabel__ == 4 ? 0 : ($29));
        if ($31) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $32
        var $33=HEAP[$level];
        var $34=(($33) + 1)&4294967295;
        HEAP[$level]=$34;
        __label__ = 4; break;
      case 9: // $35
        var $36=HEAP[$level];
        HEAP[$i]=$36;
        __label__ = 10; break;
      case 10: // $37
        var $38=HEAP[$i];
        var $39=HEAP[$5];
        var $40=unSign(($38), 32, 0) < unSign(($39), 32, 0);
        if ($40) { __lastLabel__ = 10; __label__ = 11; break; } else { __lastLabel__ = 10; __label__ = 12; break; }
      case 11: // $41
        var $42=HEAP[$i];
        var $43=HEAP[$4];
        var $44=($43+$42)&4294967295;
        var $45=HEAP[$44];
        var $46=reSign(($45), 8, 0);
        var $47=((($46))|0)==32;
        if ($47) { __lastLabel__ = 11; __label__ = 13; break; } else { __lastLabel__ = 11; __label__ = 14; break; }
      case 14: // $48
        var $49=HEAP[$i];
        var $50=HEAP[$4];
        var $51=($50+$49)&4294967295;
        var $52=HEAP[$51];
        var $53=reSign(($52), 8, 0);
        var $54=((($53))|0)==9;
        __lastLabel__ = 14; __label__ = 13; break;
      case 13: // $55
        var $56=__lastLabel__ == 11 ? 1 : ($54);
        __lastLabel__ = 13; __label__ = 12; break;
      case 12: // $57
        var $58=__lastLabel__ == 10 ? 0 : ($56);
        if ($58) { __label__ = 15; break; } else { __label__ = 16; break; }
      case 15: // $59
        __label__ = 17; break;
      case 17: // $60
        var $61=HEAP[$i];
        var $62=(($61) + 1)&4294967295;
        HEAP[$i]=$62;
        __label__ = 10; break;
      case 16: // $63
        var $64=HEAP[$i];
        HEAP[$end]=$64;
        __label__ = 18; break;
      case 18: // $65
        var $66=HEAP[$end];
        var $67=HEAP[$5];
        var $68=unSign(($66), 32, 0) < unSign(($67), 32, 0);
        if ($68) { __lastLabel__ = 18; __label__ = 19; break; } else { __lastLabel__ = 18; __label__ = 20; break; }
      case 19: // $69
        var $70=HEAP[$end];
        var $71=HEAP[$4];
        var $72=($71+$70)&4294967295;
        var $73=HEAP[$72];
        var $74=reSign(($73), 8, 0);
        var $75=((($74))|0)!=10;
        __lastLabel__ = 19; __label__ = 20; break;
      case 20: // $76
        var $77=__lastLabel__ == 18 ? 0 : ($75);
        if ($77) { __label__ = 21; break; } else { __label__ = 22; break; }
      case 21: // $78
        __label__ = 23; break;
      case 23: // $79
        var $80=HEAP[$end];
        var $81=(($80) + 1)&4294967295;
        HEAP[$end]=$81;
        __label__ = 18; break;
      case 22: // $82
        var $83=HEAP[$end];
        HEAP[$skip]=$83;
        __label__ = 24; break;
      case 24: // $84
        var $85=HEAP[$end];
        var $86=((($85))|0)!=0;
        if ($86) { __lastLabel__ = 24; __label__ = 25; break; } else { __lastLabel__ = 24; __label__ = 26; break; }
      case 25: // $87
        var $88=HEAP[$end];
        var $89=(($88) - 1)&4294967295;
        var $90=HEAP[$4];
        var $91=($90+$89)&4294967295;
        var $92=HEAP[$91];
        var $93=reSign(($92), 8, 0);
        var $94=((($93))|0)==35;
        __lastLabel__ = 25; __label__ = 26; break;
      case 26: // $95
        var $96=__lastLabel__ == 24 ? 0 : ($94);
        if ($96) { __label__ = 27; break; } else { __label__ = 28; break; }
      case 27: // $97
        var $98=HEAP[$end];
        var $99=(($98) + -1)&4294967295;
        HEAP[$end]=$99;
        __label__ = 24; break;
      case 28: // $100
        __label__ = 29; break;
      case 29: // $101
        var $102=HEAP[$end];
        var $103=((($102))|0)!=0;
        if ($103) { __lastLabel__ = 29; __label__ = 30; break; } else { __lastLabel__ = 29; __label__ = 31; break; }
      case 30: // $104
        var $105=HEAP[$end];
        var $106=(($105) - 1)&4294967295;
        var $107=HEAP[$4];
        var $108=($107+$106)&4294967295;
        var $109=HEAP[$108];
        var $110=reSign(($109), 8, 0);
        var $111=((($110))|0)==32;
        if ($111) { __lastLabel__ = 30; __label__ = 32; break; } else { __lastLabel__ = 30; __label__ = 33; break; }
      case 33: // $112
        var $113=HEAP[$end];
        var $114=(($113) - 1)&4294967295;
        var $115=HEAP[$4];
        var $116=($115+$114)&4294967295;
        var $117=HEAP[$116];
        var $118=reSign(($117), 8, 0);
        var $119=((($118))|0)==9;
        __lastLabel__ = 33; __label__ = 32; break;
      case 32: // $120
        var $121=__lastLabel__ == 30 ? 1 : ($119);
        __lastLabel__ = 32; __label__ = 31; break;
      case 31: // $122
        var $123=__lastLabel__ == 29 ? 0 : ($121);
        if ($123) { __label__ = 34; break; } else { __label__ = 35; break; }
      case 34: // $124
        var $125=HEAP[$end];
        var $126=(($125) + -1)&4294967295;
        HEAP[$end]=$126;
        __label__ = 29; break;
      case 35: // $127
        var $128=HEAP[$end];
        var $129=HEAP[$i];
        var $130=unSign(($128), 32, 0) > unSign(($129), 32, 0);
        if ($130) { __label__ = 36; break; } else { __label__ = 37; break; }
      case 36: // $131
        var $132=HEAP[$3];
        var $133=_rndr_newbuf($132);
        HEAP[$work]=$133;
        var $134=HEAP[$work];
        var $135=HEAP[$3];
        var $136=HEAP[$4];
        var $137=HEAP[$i];
        var $138=($136+$137)&4294967295;
        var $139=HEAP[$end];
        var $140=HEAP[$i];
        var $141=(($139) - ($140))&4294967295;
        _parse_inline($134, $135, $138, $141);
        var $142=HEAP[$3];
        var $143=($142)&4294967295;
        var $144=($143+12)&4294967295;
        var $145=HEAP[$144];
        var $146=($145)!=0;
        if ($146) { __label__ = 38; break; } else { __label__ = 39; break; }
      case 38: // $147
        var $148=HEAP[$3];
        var $149=($148)&4294967295;
        var $150=($149+12)&4294967295;
        var $151=HEAP[$150];
        var $152=HEAP[$2];
        var $153=HEAP[$work];
        var $154=HEAP[$level];
        var $155=HEAP[$3];
        var $156=($155)&4294967295;
        var $157=($156+96)&4294967295;
        var $158=HEAP[$157];
        FUNCTION_TABLE[$151]($152, $153, $154, $158);
        __label__ = 39; break;
      case 39: // $159
        var $160=HEAP[$3];
        _rndr_popbuf($160);
        __label__ = 37; break;
      case 37: // $161
        var $162=HEAP[$skip];
        HEAP[$1]=$162;
        __label__ = 3; break;
      case 3: // $163
        var $164=HEAP[$1];
        STACKTOP = __stackBase__;
        return $164;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parse_htmlblock($ob, $rndr, $data, $size, $do_render) {
    var __stackBase__  = STACKTOP; STACKTOP += 60; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 60);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $6=__stackBase__+20;
        var $i=__stackBase__+24;
        var $j=__stackBase__+28;
        var $curtag=__stackBase__+32;
        var $found=__stackBase__+36;
        var $work=__stackBase__+40;
        HEAP[$2]=$ob;
        HEAP[$3]=$rndr;
        HEAP[$4]=$data;
        HEAP[$5]=$size;
        HEAP[$6]=$do_render;
        HEAP[$j]=0;
        var $7=($work)&4294967295;
        var $8=HEAP[$4];
        HEAP[$7]=$8;
        var $9=($work+4)&4294967295;
        HEAP[$9]=0;
        var $10=($work+8)&4294967295;
        HEAP[$10]=0;
        var $11=($work+12)&4294967295;
        HEAP[$11]=0;
        var $12=($work+16)&4294967295;
        HEAP[$12]=0;
        var $13=HEAP[$5];
        var $14=unSign(($13), 32, 0) < 2;
        if ($14) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $15
        var $16=HEAP[$4];
        var $17=($16)&4294967295;
        var $18=HEAP[$17];
        var $19=reSign(($18), 8, 0);
        var $20=((($19))|0)!=60;
        if ($20) { __label__ = 0; break; } else { __label__ = 2; break; }
      case 0: // $21
        HEAP[$1]=0;
        __label__ = 3; break;
      case 2: // $22
        var $23=HEAP[$4];
        var $24=($23+1)&4294967295;
        var $25=HEAP[$5];
        var $26=(($25) - 1)&4294967295;
        var $27=_find_block_tag($24, $26);
        HEAP[$curtag]=$27;
        var $28=HEAP[$curtag];
        var $29=($28)!=0;
        if ($29) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 5: // $30
        var $31=HEAP[$5];
        var $32=unSign(($31), 32, 0) > 5;
        if ($32) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $33
        var $34=HEAP[$4];
        var $35=($34+1)&4294967295;
        var $36=HEAP[$35];
        var $37=reSign(($36), 8, 0);
        var $38=((($37))|0)==33;
        if ($38) { __label__ = 8; break; } else { __label__ = 7; break; }
      case 8: // $39
        var $40=HEAP[$4];
        var $41=($40+2)&4294967295;
        var $42=HEAP[$41];
        var $43=reSign(($42), 8, 0);
        var $44=((($43))|0)==45;
        if ($44) { __label__ = 9; break; } else { __label__ = 7; break; }
      case 9: // $45
        var $46=HEAP[$4];
        var $47=($46+3)&4294967295;
        var $48=HEAP[$47];
        var $49=reSign(($48), 8, 0);
        var $50=((($49))|0)==45;
        if ($50) { __label__ = 10; break; } else { __label__ = 7; break; }
      case 10: // $51
        HEAP[$i]=5;
        __label__ = 11; break;
      case 11: // $52
        var $53=HEAP[$i];
        var $54=HEAP[$5];
        var $55=unSign(($53), 32, 0) < unSign(($54), 32, 0);
        if ($55) { __lastLabel__ = 11; __label__ = 12; break; } else { __lastLabel__ = 11; __label__ = 13; break; }
      case 12: // $56
        var $57=HEAP[$i];
        var $58=(($57) - 2)&4294967295;
        var $59=HEAP[$4];
        var $60=($59+$58)&4294967295;
        var $61=HEAP[$60];
        var $62=reSign(($61), 8, 0);
        var $63=((($62))|0)==45;
        if ($63) { __lastLabel__ = 12; __label__ = 14; break; } else { __lastLabel__ = 12; __label__ = 15; break; }
      case 14: // $64
        var $65=HEAP[$i];
        var $66=(($65) - 1)&4294967295;
        var $67=HEAP[$4];
        var $68=($67+$66)&4294967295;
        var $69=HEAP[$68];
        var $70=reSign(($69), 8, 0);
        var $71=((($70))|0)==45;
        if ($71) { __lastLabel__ = 14; __label__ = 16; break; } else { __lastLabel__ = 14; __label__ = 15; break; }
      case 16: // $72
        var $73=HEAP[$i];
        var $74=HEAP[$4];
        var $75=($74+$73)&4294967295;
        var $76=HEAP[$75];
        var $77=reSign(($76), 8, 0);
        var $78=((($77))|0)==62;
        __lastLabel__ = 16; __label__ = 15; break;
      case 15: // $79
        var $80=__lastLabel__ == 14 ? 0 : (__lastLabel__ == 12 ? 0 : ($78));
        var $81=($80) ^ 1;
        __lastLabel__ = 15; __label__ = 13; break;
      case 13: // $82
        var $83=__lastLabel__ == 11 ? 0 : ($81);
        if ($83) { __label__ = 17; break; } else { __label__ = 18; break; }
      case 17: // $84
        var $85=HEAP[$i];
        var $86=(($85) + 1)&4294967295;
        HEAP[$i]=$86;
        __label__ = 11; break;
      case 18: // $87
        var $88=HEAP[$i];
        var $89=(($88) + 1)&4294967295;
        HEAP[$i]=$89;
        var $90=HEAP[$i];
        var $91=HEAP[$5];
        var $92=unSign(($90), 32, 0) < unSign(($91), 32, 0);
        if ($92) { __label__ = 19; break; } else { __label__ = 20; break; }
      case 19: // $93
        var $94=HEAP[$4];
        var $95=HEAP[$i];
        var $96=($94+$95)&4294967295;
        var $97=HEAP[$5];
        var $98=HEAP[$i];
        var $99=(($97) - ($98))&4294967295;
        var $100=_is_empty($96, $99);
        HEAP[$j]=$100;
        __label__ = 20; break;
      case 20: // $101
        var $102=HEAP[$j];
        var $103=((($102))|0)!=0;
        if ($103) { __label__ = 21; break; } else { __label__ = 22; break; }
      case 21: // $104
        var $105=HEAP[$i];
        var $106=HEAP[$j];
        var $107=(($105) + ($106))&4294967295;
        var $108=($work+4)&4294967295;
        HEAP[$108]=$107;
        var $109=HEAP[$6];
        var $110=((($109))|0)!=0;
        if ($110) { __label__ = 23; break; } else { __label__ = 24; break; }
      case 23: // $111
        var $112=HEAP[$3];
        var $113=($112)&4294967295;
        var $114=($113+8)&4294967295;
        var $115=HEAP[$114];
        var $116=($115)!=0;
        if ($116) { __label__ = 25; break; } else { __label__ = 24; break; }
      case 25: // $117
        var $118=HEAP[$3];
        var $119=($118)&4294967295;
        var $120=($119+8)&4294967295;
        var $121=HEAP[$120];
        var $122=HEAP[$2];
        var $123=HEAP[$3];
        var $124=($123)&4294967295;
        var $125=($124+96)&4294967295;
        var $126=HEAP[$125];
        FUNCTION_TABLE[$121]($122, $work, $126);
        __label__ = 24; break;
      case 24: // $127
        var $128=($work+4)&4294967295;
        var $129=HEAP[$128];
        HEAP[$1]=$129;
        __label__ = 3; break;
      case 22: // $130
        __label__ = 7; break;
      case 7: // $131
        var $132=HEAP[$5];
        var $133=unSign(($132), 32, 0) > 4;
        if ($133) { __label__ = 26; break; } else { __label__ = 27; break; }
      case 26: // $134
        var $135=HEAP[$4];
        var $136=($135+1)&4294967295;
        var $137=HEAP[$136];
        var $138=reSign(($137), 8, 0);
        var $139=((($138))|0)==104;
        if ($139) { __label__ = 28; break; } else { __label__ = 29; break; }
      case 29: // $140
        var $141=HEAP[$4];
        var $142=($141+1)&4294967295;
        var $143=HEAP[$142];
        var $144=reSign(($143), 8, 0);
        var $145=((($144))|0)==72;
        if ($145) { __label__ = 28; break; } else { __label__ = 27; break; }
      case 28: // $146
        var $147=HEAP[$4];
        var $148=($147+2)&4294967295;
        var $149=HEAP[$148];
        var $150=reSign(($149), 8, 0);
        var $151=((($150))|0)==114;
        if ($151) { __label__ = 30; break; } else { __label__ = 31; break; }
      case 31: // $152
        var $153=HEAP[$4];
        var $154=($153+2)&4294967295;
        var $155=HEAP[$154];
        var $156=reSign(($155), 8, 0);
        var $157=((($156))|0)==82;
        if ($157) { __label__ = 30; break; } else { __label__ = 27; break; }
      case 30: // $158
        HEAP[$i]=3;
        __label__ = 32; break;
      case 32: // $159
        var $160=HEAP[$i];
        var $161=HEAP[$5];
        var $162=unSign(($160), 32, 0) < unSign(($161), 32, 0);
        if ($162) { __lastLabel__ = 32; __label__ = 33; break; } else { __lastLabel__ = 32; __label__ = 34; break; }
      case 33: // $163
        var $164=HEAP[$i];
        var $165=HEAP[$4];
        var $166=($165+$164)&4294967295;
        var $167=HEAP[$166];
        var $168=reSign(($167), 8, 0);
        var $169=((($168))|0)!=62;
        __lastLabel__ = 33; __label__ = 34; break;
      case 34: // $170
        var $171=__lastLabel__ == 32 ? 0 : ($169);
        if ($171) { __label__ = 35; break; } else { __label__ = 36; break; }
      case 35: // $172
        var $173=HEAP[$i];
        var $174=(($173) + 1)&4294967295;
        HEAP[$i]=$174;
        __label__ = 32; break;
      case 36: // $175
        var $176=HEAP[$i];
        var $177=(($176) + 1)&4294967295;
        var $178=HEAP[$5];
        var $179=unSign(($177), 32, 0) < unSign(($178), 32, 0);
        if ($179) { __label__ = 37; break; } else { __label__ = 38; break; }
      case 37: // $180
        var $181=HEAP[$i];
        var $182=(($181) + 1)&4294967295;
        HEAP[$i]=$182;
        var $183=HEAP[$4];
        var $184=HEAP[$i];
        var $185=($183+$184)&4294967295;
        var $186=HEAP[$5];
        var $187=HEAP[$i];
        var $188=(($186) - ($187))&4294967295;
        var $189=_is_empty($185, $188);
        HEAP[$j]=$189;
        var $190=HEAP[$j];
        var $191=((($190))|0)!=0;
        if ($191) { __label__ = 39; break; } else { __label__ = 40; break; }
      case 39: // $192
        var $193=HEAP[$i];
        var $194=HEAP[$j];
        var $195=(($193) + ($194))&4294967295;
        var $196=($work+4)&4294967295;
        HEAP[$196]=$195;
        var $197=HEAP[$6];
        var $198=((($197))|0)!=0;
        if ($198) { __label__ = 41; break; } else { __label__ = 42; break; }
      case 41: // $199
        var $200=HEAP[$3];
        var $201=($200)&4294967295;
        var $202=($201+8)&4294967295;
        var $203=HEAP[$202];
        var $204=($203)!=0;
        if ($204) { __label__ = 43; break; } else { __label__ = 42; break; }
      case 43: // $205
        var $206=HEAP[$3];
        var $207=($206)&4294967295;
        var $208=($207+8)&4294967295;
        var $209=HEAP[$208];
        var $210=HEAP[$2];
        var $211=HEAP[$3];
        var $212=($211)&4294967295;
        var $213=($212+96)&4294967295;
        var $214=HEAP[$213];
        FUNCTION_TABLE[$209]($210, $work, $214);
        __label__ = 42; break;
      case 42: // $215
        var $216=($work+4)&4294967295;
        var $217=HEAP[$216];
        HEAP[$1]=$217;
        __label__ = 3; break;
      case 40: // $218
        __label__ = 38; break;
      case 38: // $219
        __label__ = 27; break;
      case 27: // $220
        HEAP[$1]=0;
        __label__ = 3; break;
      case 4: // $221
        HEAP[$i]=1;
        HEAP[$found]=0;
        __label__ = 44; break;
      case 44: // $222
        var $223=HEAP[$i];
        var $224=HEAP[$5];
        var $225=unSign(($223), 32, 0) < unSign(($224), 32, 0);
        if ($225) { __label__ = 45; break; } else { __label__ = 46; break; }
      case 45: // $226
        var $227=HEAP[$i];
        var $228=(($227) + 1)&4294967295;
        HEAP[$i]=$228;
        __label__ = 47; break;
      case 47: // $229
        var $230=HEAP[$i];
        var $231=HEAP[$5];
        var $232=unSign(($230), 32, 0) < unSign(($231), 32, 0);
        if ($232) { __lastLabel__ = 47; __label__ = 48; break; } else { __lastLabel__ = 47; __label__ = 49; break; }
      case 48: // $233
        var $234=HEAP[$i];
        var $235=(($234) - 2)&4294967295;
        var $236=HEAP[$4];
        var $237=($236+$235)&4294967295;
        var $238=HEAP[$237];
        var $239=reSign(($238), 8, 0);
        var $240=((($239))|0)==10;
        if ($240) { __lastLabel__ = 48; __label__ = 50; break; } else { __lastLabel__ = 48; __label__ = 51; break; }
      case 50: // $241
        var $242=HEAP[$i];
        var $243=(($242) - 1)&4294967295;
        var $244=HEAP[$4];
        var $245=($244+$243)&4294967295;
        var $246=HEAP[$245];
        var $247=reSign(($246), 8, 0);
        var $248=((($247))|0)==60;
        if ($248) { __lastLabel__ = 50; __label__ = 52; break; } else { __lastLabel__ = 50; __label__ = 51; break; }
      case 52: // $249
        var $250=HEAP[$i];
        var $251=HEAP[$4];
        var $252=($251+$250)&4294967295;
        var $253=HEAP[$252];
        var $254=reSign(($253), 8, 0);
        var $255=((($254))|0)==47;
        __lastLabel__ = 52; __label__ = 51; break;
      case 51: // $256
        var $257=__lastLabel__ == 50 ? 0 : (__lastLabel__ == 48 ? 0 : ($255));
        var $258=($257) ^ 1;
        __lastLabel__ = 51; __label__ = 49; break;
      case 49: // $259
        var $260=__lastLabel__ == 47 ? 0 : ($258);
        if ($260) { __label__ = 53; break; } else { __label__ = 54; break; }
      case 53: // $261
        var $262=HEAP[$i];
        var $263=(($262) + 1)&4294967295;
        HEAP[$i]=$263;
        __label__ = 47; break;
      case 54: // $264
        var $265=HEAP[$i];
        var $266=(($265) + 2)&4294967295;
        var $267=HEAP[$curtag];
        var $268=($267+4)&4294967295;
        var $269=HEAP[$268];
        var $270=(($266) + ($269))&4294967295;
        var $271=HEAP[$5];
        var $272=unSign(($270), 32, 0) >= unSign(($271), 32, 0);
        if ($272) { __label__ = 55; break; } else { __label__ = 56; break; }
      case 55: // $273
        __label__ = 46; break;
      case 56: // $274
        var $275=HEAP[$curtag];
        var $276=HEAP[$3];
        var $277=HEAP[$4];
        var $278=HEAP[$i];
        var $279=($277+$278)&4294967295;
        var $280=($279+-1)&4294967295;
        var $281=HEAP[$5];
        var $282=HEAP[$i];
        var $283=(($281) - ($282))&4294967295;
        var $284=(($283) + 1)&4294967295;
        var $285=_htmlblock_end($275, $276, $280, $284);
        HEAP[$j]=$285;
        var $286=HEAP[$j];
        var $287=((($286))|0)!=0;
        if ($287) { __label__ = 57; break; } else { __label__ = 58; break; }
      case 57: // $288
        var $289=HEAP[$j];
        var $290=(($289) - 1)&4294967295;
        var $291=HEAP[$i];
        var $292=(($291) + ($290))&4294967295;
        HEAP[$i]=$292;
        HEAP[$found]=1;
        __label__ = 46; break;
      case 58: // $293
        __label__ = 44; break;
      case 46: // $294
        var $295=HEAP[$found];
        var $296=((($295))|0)!=0;
        if ($296) { __label__ = 59; break; } else { __label__ = 60; break; }
      case 60: // $297
        var $298=HEAP[$curtag];
        var $299=($298)!=((_block_tags+96)&4294967295);
        if ($299) { __label__ = 61; break; } else { __label__ = 59; break; }
      case 61: // $300
        var $301=HEAP[$curtag];
        var $302=($301)!=((_block_tags+80)&4294967295);
        if ($302) { __label__ = 62; break; } else { __label__ = 59; break; }
      case 62: // $303
        HEAP[$i]=1;
        __label__ = 63; break;
      case 63: // $304
        var $305=HEAP[$i];
        var $306=HEAP[$5];
        var $307=unSign(($305), 32, 0) < unSign(($306), 32, 0);
        if ($307) { __label__ = 64; break; } else { __label__ = 65; break; }
      case 64: // $308
        var $309=HEAP[$i];
        var $310=(($309) + 1)&4294967295;
        HEAP[$i]=$310;
        __label__ = 66; break;
      case 66: // $311
        var $312=HEAP[$i];
        var $313=HEAP[$5];
        var $314=unSign(($312), 32, 0) < unSign(($313), 32, 0);
        if ($314) { __lastLabel__ = 66; __label__ = 67; break; } else { __lastLabel__ = 66; __label__ = 68; break; }
      case 67: // $315
        var $316=HEAP[$i];
        var $317=(($316) - 1)&4294967295;
        var $318=HEAP[$4];
        var $319=($318+$317)&4294967295;
        var $320=HEAP[$319];
        var $321=reSign(($320), 8, 0);
        var $322=((($321))|0)==60;
        if ($322) { __lastLabel__ = 67; __label__ = 69; break; } else { __lastLabel__ = 67; __label__ = 70; break; }
      case 69: // $323
        var $324=HEAP[$i];
        var $325=HEAP[$4];
        var $326=($325+$324)&4294967295;
        var $327=HEAP[$326];
        var $328=reSign(($327), 8, 0);
        var $329=((($328))|0)==47;
        __lastLabel__ = 69; __label__ = 70; break;
      case 70: // $330
        var $331=__lastLabel__ == 67 ? 0 : ($329);
        var $332=($331) ^ 1;
        __lastLabel__ = 70; __label__ = 68; break;
      case 68: // $333
        var $334=__lastLabel__ == 66 ? 0 : ($332);
        if ($334) { __label__ = 71; break; } else { __label__ = 72; break; }
      case 71: // $335
        var $336=HEAP[$i];
        var $337=(($336) + 1)&4294967295;
        HEAP[$i]=$337;
        __label__ = 66; break;
      case 72: // $338
        var $339=HEAP[$i];
        var $340=(($339) + 2)&4294967295;
        var $341=HEAP[$curtag];
        var $342=($341+4)&4294967295;
        var $343=HEAP[$342];
        var $344=(($340) + ($343))&4294967295;
        var $345=HEAP[$5];
        var $346=unSign(($344), 32, 0) >= unSign(($345), 32, 0);
        if ($346) { __label__ = 73; break; } else { __label__ = 74; break; }
      case 73: // $347
        __label__ = 65; break;
      case 74: // $348
        var $349=HEAP[$curtag];
        var $350=HEAP[$3];
        var $351=HEAP[$4];
        var $352=HEAP[$i];
        var $353=($351+$352)&4294967295;
        var $354=($353+-1)&4294967295;
        var $355=HEAP[$5];
        var $356=HEAP[$i];
        var $357=(($355) - ($356))&4294967295;
        var $358=(($357) + 1)&4294967295;
        var $359=_htmlblock_end($349, $350, $354, $358);
        HEAP[$j]=$359;
        var $360=HEAP[$j];
        var $361=((($360))|0)!=0;
        if ($361) { __label__ = 75; break; } else { __label__ = 76; break; }
      case 75: // $362
        var $363=HEAP[$j];
        var $364=(($363) - 1)&4294967295;
        var $365=HEAP[$i];
        var $366=(($365) + ($364))&4294967295;
        HEAP[$i]=$366;
        HEAP[$found]=1;
        __label__ = 65; break;
      case 76: // $367
        __label__ = 63; break;
      case 65: // $368
        __label__ = 59; break;
      case 59: // $369
        var $370=HEAP[$found];
        var $371=((($370))|0)!=0;
        if ($371) { __label__ = 77; break; } else { __label__ = 78; break; }
      case 78: // $372
        HEAP[$1]=0;
        __label__ = 3; break;
      case 77: // $373
        var $374=HEAP[$i];
        var $375=($work+4)&4294967295;
        HEAP[$375]=$374;
        var $376=HEAP[$6];
        var $377=((($376))|0)!=0;
        if ($377) { __label__ = 79; break; } else { __label__ = 80; break; }
      case 79: // $378
        var $379=HEAP[$3];
        var $380=($379)&4294967295;
        var $381=($380+8)&4294967295;
        var $382=HEAP[$381];
        var $383=($382)!=0;
        if ($383) { __label__ = 81; break; } else { __label__ = 80; break; }
      case 81: // $384
        var $385=HEAP[$3];
        var $386=($385)&4294967295;
        var $387=($386+8)&4294967295;
        var $388=HEAP[$387];
        var $389=HEAP[$2];
        var $390=HEAP[$3];
        var $391=($390)&4294967295;
        var $392=($391+96)&4294967295;
        var $393=HEAP[$392];
        FUNCTION_TABLE[$388]($389, $work, $393);
        __label__ = 80; break;
      case 80: // $394
        var $395=HEAP[$i];
        HEAP[$1]=$395;
        __label__ = 3; break;
      case 3: // $396
        var $397=HEAP[$1];
        STACKTOP = __stackBase__;
        return $397;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _is_empty($data, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 16);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $i=__stackBase__+12;
        HEAP[$2]=$data;
        HEAP[$3]=$size;
        HEAP[$i]=0;
        __label__ = 0; break;
      case 0: // $4
        var $5=HEAP[$i];
        var $6=HEAP[$3];
        var $7=unSign(($5), 32, 0) < unSign(($6), 32, 0);
        if ($7) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 1: // $8
        var $9=HEAP[$i];
        var $10=HEAP[$2];
        var $11=($10+$9)&4294967295;
        var $12=HEAP[$11];
        var $13=reSign(($12), 8, 0);
        var $14=((($13))|0)!=10;
        __lastLabel__ = 1; __label__ = 2; break;
      case 2: // $15
        var $16=__lastLabel__ == 0 ? 0 : ($14);
        if ($16) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $17
        var $18=HEAP[$i];
        var $19=HEAP[$2];
        var $20=($19+$18)&4294967295;
        var $21=HEAP[$20];
        var $22=reSign(($21), 8, 0);
        var $23=((($22))|0)!=32;
        if ($23) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $24
        var $25=HEAP[$i];
        var $26=HEAP[$2];
        var $27=($26+$25)&4294967295;
        var $28=HEAP[$27];
        var $29=reSign(($28), 8, 0);
        var $30=((($29))|0)!=9;
        if ($30) { __label__ = 7; break; } else { __label__ = 6; break; }
      case 7: // $31
        HEAP[$1]=0;
        __label__ = 8; break;
      case 6: // $32
        __label__ = 9; break;
      case 9: // $33
        var $34=HEAP[$i];
        var $35=(($34) + 1)&4294967295;
        HEAP[$i]=$35;
        __label__ = 0; break;
      case 4: // $36
        var $37=HEAP[$i];
        var $38=(($37) + 1)&4294967295;
        HEAP[$1]=$38;
        __label__ = 8; break;
      case 8: // $39
        var $40=HEAP[$1];
        STACKTOP = __stackBase__;
        return $40;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _is_hrule($data, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 21; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 21);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $i=__stackBase__+12;
        var $n=__stackBase__+16;
        var $c=__stackBase__+20;
        HEAP[$2]=$data;
        HEAP[$3]=$size;
        HEAP[$i]=0;
        HEAP[$n]=0;
        var $4=HEAP[$3];
        var $5=unSign(($4), 32, 0) < 3;
        if ($5) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $6
        HEAP[$1]=0;
        __label__ = 2; break;
      case 1: // $7
        var $8=HEAP[$2];
        var $9=($8)&4294967295;
        var $10=HEAP[$9];
        var $11=reSign(($10), 8, 0);
        var $12=((($11))|0)==32;
        if ($12) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $13
        var $14=HEAP[$i];
        var $15=(($14) + 1)&4294967295;
        HEAP[$i]=$15;
        var $16=HEAP[$2];
        var $17=($16+1)&4294967295;
        var $18=HEAP[$17];
        var $19=reSign(($18), 8, 0);
        var $20=((($19))|0)==32;
        if ($20) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $21
        var $22=HEAP[$i];
        var $23=(($22) + 1)&4294967295;
        HEAP[$i]=$23;
        var $24=HEAP[$2];
        var $25=($24+2)&4294967295;
        var $26=HEAP[$25];
        var $27=reSign(($26), 8, 0);
        var $28=((($27))|0)==32;
        if ($28) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $29
        var $30=HEAP[$i];
        var $31=(($30) + 1)&4294967295;
        HEAP[$i]=$31;
        __label__ = 8; break;
      case 8: // $32
        __label__ = 6; break;
      case 6: // $33
        __label__ = 4; break;
      case 4: // $34
        var $35=HEAP[$i];
        var $36=(($35) + 2)&4294967295;
        var $37=HEAP[$3];
        var $38=unSign(($36), 32, 0) >= unSign(($37), 32, 0);
        if ($38) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 10: // $39
        var $40=HEAP[$i];
        var $41=HEAP[$2];
        var $42=($41+$40)&4294967295;
        var $43=HEAP[$42];
        var $44=reSign(($43), 8, 0);
        var $45=((($44))|0)!=42;
        if ($45) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $46
        var $47=HEAP[$i];
        var $48=HEAP[$2];
        var $49=($48+$47)&4294967295;
        var $50=HEAP[$49];
        var $51=reSign(($50), 8, 0);
        var $52=((($51))|0)!=45;
        if ($52) { __label__ = 13; break; } else { __label__ = 12; break; }
      case 13: // $53
        var $54=HEAP[$i];
        var $55=HEAP[$2];
        var $56=($55+$54)&4294967295;
        var $57=HEAP[$56];
        var $58=reSign(($57), 8, 0);
        var $59=((($58))|0)!=95;
        if ($59) { __label__ = 9; break; } else { __label__ = 12; break; }
      case 9: // $60
        HEAP[$1]=0;
        __label__ = 2; break;
      case 12: // $61
        var $62=HEAP[$i];
        var $63=HEAP[$2];
        var $64=($63+$62)&4294967295;
        var $65=HEAP[$64];
        HEAP[$c]=$65;
        __label__ = 14; break;
      case 14: // $66
        var $67=HEAP[$i];
        var $68=HEAP[$3];
        var $69=unSign(($67), 32, 0) < unSign(($68), 32, 0);
        if ($69) { __lastLabel__ = 14; __label__ = 15; break; } else { __lastLabel__ = 14; __label__ = 16; break; }
      case 15: // $70
        var $71=HEAP[$i];
        var $72=HEAP[$2];
        var $73=($72+$71)&4294967295;
        var $74=HEAP[$73];
        var $75=reSign(($74), 8, 0);
        var $76=((($75))|0)!=10;
        __lastLabel__ = 15; __label__ = 16; break;
      case 16: // $77
        var $78=__lastLabel__ == 14 ? 0 : ($76);
        if ($78) { __label__ = 17; break; } else { __label__ = 18; break; }
      case 17: // $79
        var $80=HEAP[$i];
        var $81=HEAP[$2];
        var $82=($81+$80)&4294967295;
        var $83=HEAP[$82];
        var $84=reSign(($83), 8, 0);
        var $85=HEAP[$c];
        var $86=reSign(($85), 8, 0);
        var $87=((($84))|0)==((($86))|0);
        if ($87) { __label__ = 19; break; } else { __label__ = 20; break; }
      case 19: // $88
        var $89=HEAP[$n];
        var $90=(($89) + 1)&4294967295;
        HEAP[$n]=$90;
        __label__ = 21; break;
      case 20: // $91
        var $92=HEAP[$i];
        var $93=HEAP[$2];
        var $94=($93+$92)&4294967295;
        var $95=HEAP[$94];
        var $96=reSign(($95), 8, 0);
        var $97=((($96))|0)!=32;
        if ($97) { __label__ = 22; break; } else { __label__ = 23; break; }
      case 22: // $98
        var $99=HEAP[$i];
        var $100=HEAP[$2];
        var $101=($100+$99)&4294967295;
        var $102=HEAP[$101];
        var $103=reSign(($102), 8, 0);
        var $104=((($103))|0)!=9;
        if ($104) { __label__ = 24; break; } else { __label__ = 23; break; }
      case 24: // $105
        HEAP[$1]=0;
        __label__ = 2; break;
      case 23: // $106
        __label__ = 21; break;
      case 21: // $107
        var $108=HEAP[$i];
        var $109=(($108) + 1)&4294967295;
        HEAP[$i]=$109;
        __label__ = 14; break;
      case 18: // $110
        var $111=HEAP[$n];
        var $112=unSign(($111), 32, 0) >= 3;
        var $113=unSign(($112), 1, 0);
        HEAP[$1]=$113;
        __label__ = 2; break;
      case 2: // $114
        var $115=HEAP[$1];
        STACKTOP = __stackBase__;
        return $115;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parse_fencedcode($ob, $rndr, $data, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 56; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 56);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $beg=__stackBase__+20;
        var $end=__stackBase__+24;
        var $work=__stackBase__+28;
        var $lang=__stackBase__+32;
        var $fence_end=__stackBase__+52;
        HEAP[$2]=$ob;
        HEAP[$3]=$rndr;
        HEAP[$4]=$data;
        HEAP[$5]=$size;
        HEAP[$work]=0;
        var $6=$lang;
        _llvm_memset_p0i8_i32($6, 0, 20, 4, 0);
        var $7=HEAP[$4];
        var $8=HEAP[$5];
        var $9=_is_codefence($7, $8, $lang);
        HEAP[$beg]=$9;
        var $10=HEAP[$beg];
        var $11=((($10))|0)==0;
        if ($11) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $12
        HEAP[$1]=0;
        __label__ = 2; break;
      case 1: // $13
        var $14=HEAP[$3];
        var $15=_rndr_newbuf($14);
        HEAP[$work]=$15;
        __label__ = 3; break;
      case 3: // $16
        var $17=HEAP[$beg];
        var $18=HEAP[$5];
        var $19=unSign(($17), 32, 0) < unSign(($18), 32, 0);
        if ($19) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $20
        var $21=HEAP[$4];
        var $22=HEAP[$beg];
        var $23=($21+$22)&4294967295;
        var $24=HEAP[$5];
        var $25=HEAP[$beg];
        var $26=(($24) - ($25))&4294967295;
        var $27=_is_codefence($23, $26, 0);
        HEAP[$fence_end]=$27;
        var $28=HEAP[$fence_end];
        var $29=((($28))|0)!=0;
        if ($29) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $30
        var $31=HEAP[$fence_end];
        var $32=HEAP[$beg];
        var $33=(($32) + ($31))&4294967295;
        HEAP[$beg]=$33;
        __label__ = 5; break;
      case 7: // $34
        var $35=HEAP[$beg];
        var $36=(($35) + 1)&4294967295;
        HEAP[$end]=$36;
        __label__ = 8; break;
      case 8: // $37
        var $38=HEAP[$end];
        var $39=HEAP[$5];
        var $40=unSign(($38), 32, 0) < unSign(($39), 32, 0);
        if ($40) { __lastLabel__ = 8; __label__ = 9; break; } else { __lastLabel__ = 8; __label__ = 10; break; }
      case 9: // $41
        var $42=HEAP[$end];
        var $43=(($42) - 1)&4294967295;
        var $44=HEAP[$4];
        var $45=($44+$43)&4294967295;
        var $46=HEAP[$45];
        var $47=reSign(($46), 8, 0);
        var $48=((($47))|0)!=10;
        __lastLabel__ = 9; __label__ = 10; break;
      case 10: // $49
        var $50=__lastLabel__ == 8 ? 0 : ($48);
        if ($50) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $51
        __label__ = 13; break;
      case 13: // $52
        var $53=HEAP[$end];
        var $54=(($53) + 1)&4294967295;
        HEAP[$end]=$54;
        __label__ = 8; break;
      case 12: // $55
        var $56=HEAP[$beg];
        var $57=HEAP[$end];
        var $58=unSign(($56), 32, 0) < unSign(($57), 32, 0);
        if ($58) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 14: // $59
        var $60=HEAP[$4];
        var $61=HEAP[$beg];
        var $62=($60+$61)&4294967295;
        var $63=HEAP[$end];
        var $64=HEAP[$beg];
        var $65=(($63) - ($64))&4294967295;
        var $66=_is_empty($62, $65);
        var $67=((($66))|0)!=0;
        if ($67) { __label__ = 16; break; } else { __label__ = 17; break; }
      case 16: // $68
        var $69=HEAP[$work];
        _bufputc($69, 10);
        __label__ = 18; break;
      case 17: // $70
        var $71=HEAP[$work];
        var $72=HEAP[$4];
        var $73=HEAP[$beg];
        var $74=($72+$73)&4294967295;
        var $75=HEAP[$end];
        var $76=HEAP[$beg];
        var $77=(($75) - ($76))&4294967295;
        _bufput($71, $74, $77);
        __label__ = 18; break;
      case 18: // $78
        __label__ = 15; break;
      case 15: // $79
        var $80=HEAP[$end];
        HEAP[$beg]=$80;
        __label__ = 3; break;
      case 5: // $81
        var $82=HEAP[$work];
        var $83=($82+4)&4294967295;
        var $84=HEAP[$83];
        var $85=((($84))|0)!=0;
        if ($85) { __label__ = 19; break; } else { __label__ = 20; break; }
      case 19: // $86
        var $87=HEAP[$work];
        var $88=($87+4)&4294967295;
        var $89=HEAP[$88];
        var $90=(($89) - 1)&4294967295;
        var $91=HEAP[$work];
        var $92=($91)&4294967295;
        var $93=HEAP[$92];
        var $94=($93+$90)&4294967295;
        var $95=HEAP[$94];
        var $96=reSign(($95), 8, 0);
        var $97=((($96))|0)!=10;
        if ($97) { __label__ = 21; break; } else { __label__ = 20; break; }
      case 21: // $98
        var $99=HEAP[$work];
        _bufputc($99, 10);
        __label__ = 20; break;
      case 20: // $100
        var $101=HEAP[$3];
        var $102=($101)&4294967295;
        var $103=($102)&4294967295;
        var $104=HEAP[$103];
        var $105=($104)!=0;
        if ($105) { __label__ = 22; break; } else { __label__ = 23; break; }
      case 22: // $106
        var $107=HEAP[$3];
        var $108=($107)&4294967295;
        var $109=($108)&4294967295;
        var $110=HEAP[$109];
        var $111=HEAP[$2];
        var $112=HEAP[$work];
        var $113=($lang+4)&4294967295;
        var $114=HEAP[$113];
        var $115=((($114))|0)!=0;
        if ($115) { __label__ = 24; break; } else { __label__ = 25; break; }
      case 24: // $116
        __lastLabel__ = 24; __label__ = 26; break;
      case 25: // $117
        __lastLabel__ = 25; __label__ = 26; break;
      case 26: // $118
        var $119=__lastLabel__ == 24 ? $lang : (0);
        var $120=HEAP[$3];
        var $121=($120)&4294967295;
        var $122=($121+96)&4294967295;
        var $123=HEAP[$122];
        FUNCTION_TABLE[$110]($111, $112, $119, $123);
        __label__ = 23; break;
      case 23: // $124
        var $125=HEAP[$3];
        _rndr_popbuf($125);
        var $126=HEAP[$beg];
        HEAP[$1]=$126;
        __label__ = 2; break;
      case 2: // $127
        var $128=HEAP[$1];
        STACKTOP = __stackBase__;
        return $128;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parse_table($ob, $rndr, $data, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 44; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 44);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $i=__stackBase__+16;
        var $header_work=__stackBase__+20;
        var $body_work=__stackBase__+24;
        var $columns=__stackBase__+28;
        var $col_data=__stackBase__+32;
        var $row_start=__stackBase__+36;
        var $pipes=__stackBase__+40;
        HEAP[$1]=$ob;
        HEAP[$2]=$rndr;
        HEAP[$3]=$data;
        HEAP[$4]=$size;
        HEAP[$header_work]=0;
        HEAP[$body_work]=0;
        HEAP[$col_data]=0;
        var $5=HEAP[$2];
        var $6=_rndr_newbuf($5);
        HEAP[$header_work]=$6;
        var $7=HEAP[$2];
        var $8=_rndr_newbuf($7);
        HEAP[$body_work]=$8;
        var $9=HEAP[$header_work];
        var $10=HEAP[$2];
        var $11=HEAP[$3];
        var $12=HEAP[$4];
        var $13=_parse_table_header($9, $10, $11, $12, $columns, $col_data);
        HEAP[$i]=$13;
        var $14=HEAP[$i];
        var $15=unSign(($14), 32, 0) > 0;
        if ($15) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $16
        __label__ = 2; break;
      case 2: // $17
        var $18=HEAP[$i];
        var $19=HEAP[$4];
        var $20=unSign(($18), 32, 0) < unSign(($19), 32, 0);
        if ($20) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $21
        HEAP[$pipes]=0;
        var $22=HEAP[$i];
        HEAP[$row_start]=$22;
        __label__ = 5; break;
      case 5: // $23
        var $24=HEAP[$i];
        var $25=HEAP[$4];
        var $26=unSign(($24), 32, 0) < unSign(($25), 32, 0);
        if ($26) { __lastLabel__ = 5; __label__ = 6; break; } else { __lastLabel__ = 5; __label__ = 7; break; }
      case 6: // $27
        var $28=HEAP[$i];
        var $29=HEAP[$3];
        var $30=($29+$28)&4294967295;
        var $31=HEAP[$30];
        var $32=reSign(($31), 8, 0);
        var $33=((($32))|0)!=10;
        __lastLabel__ = 6; __label__ = 7; break;
      case 7: // $34
        var $35=__lastLabel__ == 5 ? 0 : ($33);
        if ($35) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $36
        var $37=HEAP[$i];
        var $38=(($37) + 1)&4294967295;
        HEAP[$i]=$38;
        var $39=HEAP[$3];
        var $40=($39+$37)&4294967295;
        var $41=HEAP[$40];
        var $42=reSign(($41), 8, 0);
        var $43=((($42))|0)==124;
        if ($43) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $44
        var $45=HEAP[$pipes];
        var $46=(($45) + 1)&4294967295;
        HEAP[$pipes]=$46;
        __label__ = 11; break;
      case 11: // $47
        __label__ = 5; break;
      case 9: // $48
        var $49=HEAP[$pipes];
        var $50=((($49))|0)==0;
        if ($50) { __label__ = 12; break; } else { __label__ = 13; break; }
      case 13: // $51
        var $52=HEAP[$i];
        var $53=HEAP[$4];
        var $54=((($52))|0)==((($53))|0);
        if ($54) { __label__ = 12; break; } else { __label__ = 14; break; }
      case 12: // $55
        var $56=HEAP[$row_start];
        HEAP[$i]=$56;
        __label__ = 4; break;
      case 14: // $57
        var $58=HEAP[$body_work];
        var $59=HEAP[$2];
        var $60=HEAP[$3];
        var $61=HEAP[$row_start];
        var $62=($60+$61)&4294967295;
        var $63=HEAP[$i];
        var $64=HEAP[$row_start];
        var $65=(($63) - ($64))&4294967295;
        var $66=HEAP[$columns];
        var $67=HEAP[$col_data];
        _parse_table_row($58, $59, $62, $65, $66, $67);
        var $68=HEAP[$i];
        var $69=(($68) + 1)&4294967295;
        HEAP[$i]=$69;
        __label__ = 2; break;
      case 4: // $70
        var $71=HEAP[$2];
        var $72=($71)&4294967295;
        var $73=($72+32)&4294967295;
        var $74=HEAP[$73];
        var $75=($74)!=0;
        if ($75) { __label__ = 15; break; } else { __label__ = 16; break; }
      case 15: // $76
        var $77=HEAP[$2];
        var $78=($77)&4294967295;
        var $79=($78+32)&4294967295;
        var $80=HEAP[$79];
        var $81=HEAP[$1];
        var $82=HEAP[$header_work];
        var $83=HEAP[$body_work];
        var $84=HEAP[$2];
        var $85=($84)&4294967295;
        var $86=($85+96)&4294967295;
        var $87=HEAP[$86];
        FUNCTION_TABLE[$80]($81, $82, $83, $87);
        __label__ = 16; break;
      case 16: // $88
        __label__ = 1; break;
      case 1: // $89
        var $90=HEAP[$col_data];
        var $91=$90;
        _free($91);
        var $92=HEAP[$2];
        _rndr_popbuf($92);
        var $93=HEAP[$2];
        _rndr_popbuf($93);
        var $94=HEAP[$i];
        STACKTOP = __stackBase__;
        return $94;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _prefix_quote($data, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 16);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $i=__stackBase__+12;
        HEAP[$2]=$data;
        HEAP[$3]=$size;
        HEAP[$i]=0;
        var $4=HEAP[$i];
        var $5=HEAP[$3];
        var $6=unSign(($4), 32, 0) < unSign(($5), 32, 0);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        var $8=HEAP[$i];
        var $9=HEAP[$2];
        var $10=($9+$8)&4294967295;
        var $11=HEAP[$10];
        var $12=reSign(($11), 8, 0);
        var $13=((($12))|0)==32;
        if ($13) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 2: // $14
        var $15=HEAP[$i];
        var $16=(($15) + 1)&4294967295;
        HEAP[$i]=$16;
        __label__ = 1; break;
      case 1: // $17
        var $18=HEAP[$i];
        var $19=HEAP[$3];
        var $20=unSign(($18), 32, 0) < unSign(($19), 32, 0);
        if ($20) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $21
        var $22=HEAP[$i];
        var $23=HEAP[$2];
        var $24=($23+$22)&4294967295;
        var $25=HEAP[$24];
        var $26=reSign(($25), 8, 0);
        var $27=((($26))|0)==32;
        if ($27) { __label__ = 5; break; } else { __label__ = 4; break; }
      case 5: // $28
        var $29=HEAP[$i];
        var $30=(($29) + 1)&4294967295;
        HEAP[$i]=$30;
        __label__ = 4; break;
      case 4: // $31
        var $32=HEAP[$i];
        var $33=HEAP[$3];
        var $34=unSign(($32), 32, 0) < unSign(($33), 32, 0);
        if ($34) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $35
        var $36=HEAP[$i];
        var $37=HEAP[$2];
        var $38=($37+$36)&4294967295;
        var $39=HEAP[$38];
        var $40=reSign(($39), 8, 0);
        var $41=((($40))|0)==32;
        if ($41) { __label__ = 8; break; } else { __label__ = 7; break; }
      case 8: // $42
        var $43=HEAP[$i];
        var $44=(($43) + 1)&4294967295;
        HEAP[$i]=$44;
        __label__ = 7; break;
      case 7: // $45
        var $46=HEAP[$i];
        var $47=HEAP[$3];
        var $48=unSign(($46), 32, 0) < unSign(($47), 32, 0);
        if ($48) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $49
        var $50=HEAP[$i];
        var $51=HEAP[$2];
        var $52=($51+$50)&4294967295;
        var $53=HEAP[$52];
        var $54=reSign(($53), 8, 0);
        var $55=((($54))|0)==62;
        if ($55) { __label__ = 11; break; } else { __label__ = 10; break; }
      case 11: // $56
        var $57=HEAP[$i];
        var $58=(($57) + 1)&4294967295;
        var $59=HEAP[$3];
        var $60=unSign(($58), 32, 0) < unSign(($59), 32, 0);
        if ($60) { __label__ = 12; break; } else { __label__ = 13; break; }
      case 12: // $61
        var $62=HEAP[$i];
        var $63=(($62) + 1)&4294967295;
        var $64=HEAP[$2];
        var $65=($64+$63)&4294967295;
        var $66=HEAP[$65];
        var $67=reSign(($66), 8, 0);
        var $68=((($67))|0)==32;
        if ($68) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 15: // $69
        var $70=HEAP[$i];
        var $71=(($70) + 1)&4294967295;
        var $72=HEAP[$2];
        var $73=($72+$71)&4294967295;
        var $74=HEAP[$73];
        var $75=reSign(($74), 8, 0);
        var $76=((($75))|0)==9;
        if ($76) { __label__ = 14; break; } else { __label__ = 13; break; }
      case 14: // $77
        var $78=HEAP[$i];
        var $79=(($78) + 2)&4294967295;
        HEAP[$1]=$79;
        __label__ = 16; break;
      case 13: // $80
        var $81=HEAP[$i];
        var $82=(($81) + 1)&4294967295;
        HEAP[$1]=$82;
        __label__ = 16; break;
      case 10: // $83
        HEAP[$1]=0;
        __label__ = 16; break;
      case 16: // $84
        var $85=HEAP[$1];
        STACKTOP = __stackBase__;
        return $85;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parse_blockquote($ob, $rndr, $data, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 40; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 40);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $beg=__stackBase__+16;
        var $end=__stackBase__+20;
        var $pre=__stackBase__+24;
        var $work_size=__stackBase__+28;
        var $work_data=__stackBase__+32;
        var $out=__stackBase__+36;
        HEAP[$1]=$ob;
        HEAP[$2]=$rndr;
        HEAP[$3]=$data;
        HEAP[$4]=$size;
        HEAP[$end]=0;
        HEAP[$work_size]=0;
        HEAP[$work_data]=0;
        HEAP[$out]=0;
        var $5=HEAP[$2];
        var $6=_rndr_newbuf($5);
        HEAP[$out]=$6;
        HEAP[$beg]=0;
        __label__ = 0; break;
      case 0: // $7
        var $8=HEAP[$beg];
        var $9=HEAP[$4];
        var $10=unSign(($8), 32, 0) < unSign(($9), 32, 0);
        if ($10) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $11
        var $12=HEAP[$beg];
        var $13=(($12) + 1)&4294967295;
        HEAP[$end]=$13;
        __label__ = 3; break;
      case 3: // $14
        var $15=HEAP[$end];
        var $16=HEAP[$4];
        var $17=unSign(($15), 32, 0) < unSign(($16), 32, 0);
        if ($17) { __lastLabel__ = 3; __label__ = 4; break; } else { __lastLabel__ = 3; __label__ = 5; break; }
      case 4: // $18
        var $19=HEAP[$end];
        var $20=(($19) - 1)&4294967295;
        var $21=HEAP[$3];
        var $22=($21+$20)&4294967295;
        var $23=HEAP[$22];
        var $24=reSign(($23), 8, 0);
        var $25=((($24))|0)!=10;
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $26
        var $27=__lastLabel__ == 3 ? 0 : ($25);
        if ($27) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $28
        __label__ = 8; break;
      case 8: // $29
        var $30=HEAP[$end];
        var $31=(($30) + 1)&4294967295;
        HEAP[$end]=$31;
        __label__ = 3; break;
      case 7: // $32
        var $33=HEAP[$3];
        var $34=HEAP[$beg];
        var $35=($33+$34)&4294967295;
        var $36=HEAP[$end];
        var $37=HEAP[$beg];
        var $38=(($36) - ($37))&4294967295;
        var $39=_prefix_quote($35, $38);
        HEAP[$pre]=$39;
        var $40=HEAP[$pre];
        var $41=((($40))|0)!=0;
        if ($41) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $42
        var $43=HEAP[$pre];
        var $44=HEAP[$beg];
        var $45=(($44) + ($43))&4294967295;
        HEAP[$beg]=$45;
        __label__ = 11; break;
      case 10: // $46
        var $47=HEAP[$3];
        var $48=HEAP[$beg];
        var $49=($47+$48)&4294967295;
        var $50=HEAP[$end];
        var $51=HEAP[$beg];
        var $52=(($50) - ($51))&4294967295;
        var $53=_is_empty($49, $52);
        var $54=((($53))|0)!=0;
        if ($54) { __label__ = 12; break; } else { __label__ = 13; break; }
      case 12: // $55
        var $56=HEAP[$end];
        var $57=HEAP[$4];
        var $58=unSign(($56), 32, 0) >= unSign(($57), 32, 0);
        if ($58) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 15: // $59
        var $60=HEAP[$3];
        var $61=HEAP[$end];
        var $62=($60+$61)&4294967295;
        var $63=HEAP[$4];
        var $64=HEAP[$end];
        var $65=(($63) - ($64))&4294967295;
        var $66=_prefix_quote($62, $65);
        var $67=((($66))|0)==0;
        if ($67) { __label__ = 16; break; } else { __label__ = 13; break; }
      case 16: // $68
        var $69=HEAP[$3];
        var $70=HEAP[$end];
        var $71=($69+$70)&4294967295;
        var $72=HEAP[$4];
        var $73=HEAP[$end];
        var $74=(($72) - ($73))&4294967295;
        var $75=_is_empty($71, $74);
        var $76=((($75))|0)!=0;
        if ($76) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 14: // $77
        __label__ = 2; break;
      case 13: // $78
        __label__ = 11; break;
      case 11: // $79
        var $80=HEAP[$beg];
        var $81=HEAP[$end];
        var $82=unSign(($80), 32, 0) < unSign(($81), 32, 0);
        if ($82) { __label__ = 17; break; } else { __label__ = 18; break; }
      case 17: // $83
        var $84=HEAP[$work_data];
        var $85=($84)!=0;
        if ($85) { __label__ = 19; break; } else { __label__ = 20; break; }
      case 20: // $86
        var $87=HEAP[$3];
        var $88=HEAP[$beg];
        var $89=($87+$88)&4294967295;
        HEAP[$work_data]=$89;
        __label__ = 21; break;
      case 19: // $90
        var $91=HEAP[$3];
        var $92=HEAP[$beg];
        var $93=($91+$92)&4294967295;
        var $94=HEAP[$work_data];
        var $95=HEAP[$work_size];
        var $96=($94+$95)&4294967295;
        var $97=($93)!=($96);
        if ($97) { __label__ = 22; break; } else { __label__ = 23; break; }
      case 22: // $98
        var $99=HEAP[$work_data];
        var $100=HEAP[$work_size];
        var $101=($99+$100)&4294967295;
        var $102=HEAP[$3];
        var $103=HEAP[$beg];
        var $104=($102+$103)&4294967295;
        var $105=HEAP[$end];
        var $106=HEAP[$beg];
        var $107=(($105) - ($106))&4294967295;
        _llvm_memmove_p0i8_p0i8_i32($101, $104, $107, 1, 0);
        __label__ = 23; break;
      case 23: // $108
        __label__ = 21; break;
      case 21: // $109
        var $110=HEAP[$end];
        var $111=HEAP[$beg];
        var $112=(($110) - ($111))&4294967295;
        var $113=HEAP[$work_size];
        var $114=(($113) + ($112))&4294967295;
        HEAP[$work_size]=$114;
        __label__ = 18; break;
      case 18: // $115
        var $116=HEAP[$end];
        HEAP[$beg]=$116;
        __label__ = 0; break;
      case 2: // $117
        var $118=HEAP[$out];
        var $119=HEAP[$2];
        var $120=HEAP[$work_data];
        var $121=HEAP[$work_size];
        _parse_block($118, $119, $120, $121);
        var $122=HEAP[$2];
        var $123=($122)&4294967295;
        var $124=($123+4)&4294967295;
        var $125=HEAP[$124];
        var $126=($125)!=0;
        if ($126) { __label__ = 24; break; } else { __label__ = 25; break; }
      case 24: // $127
        var $128=HEAP[$2];
        var $129=($128)&4294967295;
        var $130=($129+4)&4294967295;
        var $131=HEAP[$130];
        var $132=HEAP[$1];
        var $133=HEAP[$out];
        var $134=HEAP[$2];
        var $135=($134)&4294967295;
        var $136=($135+96)&4294967295;
        var $137=HEAP[$136];
        FUNCTION_TABLE[$131]($132, $133, $137);
        __label__ = 25; break;
      case 25: // $138
        var $139=HEAP[$2];
        _rndr_popbuf($139);
        var $140=HEAP[$end];
        STACKTOP = __stackBase__;
        return $140;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _prefix_code($data, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 12);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        HEAP[$2]=$data;
        HEAP[$3]=$size;
        var $4=HEAP[$3];
        var $5=unSign(($4), 32, 0) > 0;
        if ($5) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $6
        var $7=HEAP[$2];
        var $8=($7)&4294967295;
        var $9=HEAP[$8];
        var $10=reSign(($9), 8, 0);
        var $11=((($10))|0)==9;
        if ($11) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 2: // $12
        HEAP[$1]=1;
        __label__ = 3; break;
      case 1: // $13
        var $14=HEAP[$3];
        var $15=unSign(($14), 32, 0) > 3;
        if ($15) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $16
        var $17=HEAP[$2];
        var $18=($17)&4294967295;
        var $19=HEAP[$18];
        var $20=reSign(($19), 8, 0);
        var $21=((($20))|0)==32;
        if ($21) { __label__ = 6; break; } else { __label__ = 5; break; }
      case 6: // $22
        var $23=HEAP[$2];
        var $24=($23+1)&4294967295;
        var $25=HEAP[$24];
        var $26=reSign(($25), 8, 0);
        var $27=((($26))|0)==32;
        if ($27) { __label__ = 7; break; } else { __label__ = 5; break; }
      case 7: // $28
        var $29=HEAP[$2];
        var $30=($29+2)&4294967295;
        var $31=HEAP[$30];
        var $32=reSign(($31), 8, 0);
        var $33=((($32))|0)==32;
        if ($33) { __label__ = 8; break; } else { __label__ = 5; break; }
      case 8: // $34
        var $35=HEAP[$2];
        var $36=($35+3)&4294967295;
        var $37=HEAP[$36];
        var $38=reSign(($37), 8, 0);
        var $39=((($38))|0)==32;
        if ($39) { __label__ = 9; break; } else { __label__ = 5; break; }
      case 9: // $40
        HEAP[$1]=4;
        __label__ = 3; break;
      case 5: // $41
        HEAP[$1]=0;
        __label__ = 3; break;
      case 3: // $42
        var $43=HEAP[$1];
        STACKTOP = __stackBase__;
        return $43;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parse_blockcode($ob, $rndr, $data, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 32; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 32);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $beg=__stackBase__+16;
        var $end=__stackBase__+20;
        var $pre=__stackBase__+24;
        var $work=__stackBase__+28;
        HEAP[$1]=$ob;
        HEAP[$2]=$rndr;
        HEAP[$3]=$data;
        HEAP[$4]=$size;
        HEAP[$work]=0;
        var $5=HEAP[$2];
        var $6=_rndr_newbuf($5);
        HEAP[$work]=$6;
        HEAP[$beg]=0;
        __label__ = 0; break;
      case 0: // $7
        var $8=HEAP[$beg];
        var $9=HEAP[$4];
        var $10=unSign(($8), 32, 0) < unSign(($9), 32, 0);
        if ($10) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $11
        var $12=HEAP[$beg];
        var $13=(($12) + 1)&4294967295;
        HEAP[$end]=$13;
        __label__ = 3; break;
      case 3: // $14
        var $15=HEAP[$end];
        var $16=HEAP[$4];
        var $17=unSign(($15), 32, 0) < unSign(($16), 32, 0);
        if ($17) { __lastLabel__ = 3; __label__ = 4; break; } else { __lastLabel__ = 3; __label__ = 5; break; }
      case 4: // $18
        var $19=HEAP[$end];
        var $20=(($19) - 1)&4294967295;
        var $21=HEAP[$3];
        var $22=($21+$20)&4294967295;
        var $23=HEAP[$22];
        var $24=reSign(($23), 8, 0);
        var $25=((($24))|0)!=10;
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $26
        var $27=__lastLabel__ == 3 ? 0 : ($25);
        if ($27) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $28
        __label__ = 8; break;
      case 8: // $29
        var $30=HEAP[$end];
        var $31=(($30) + 1)&4294967295;
        HEAP[$end]=$31;
        __label__ = 3; break;
      case 7: // $32
        var $33=HEAP[$3];
        var $34=HEAP[$beg];
        var $35=($33+$34)&4294967295;
        var $36=HEAP[$end];
        var $37=HEAP[$beg];
        var $38=(($36) - ($37))&4294967295;
        var $39=_prefix_code($35, $38);
        HEAP[$pre]=$39;
        var $40=HEAP[$pre];
        var $41=((($40))|0)!=0;
        if ($41) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $42
        var $43=HEAP[$pre];
        var $44=HEAP[$beg];
        var $45=(($44) + ($43))&4294967295;
        HEAP[$beg]=$45;
        __label__ = 11; break;
      case 10: // $46
        var $47=HEAP[$3];
        var $48=HEAP[$beg];
        var $49=($47+$48)&4294967295;
        var $50=HEAP[$end];
        var $51=HEAP[$beg];
        var $52=(($50) - ($51))&4294967295;
        var $53=_is_empty($49, $52);
        var $54=((($53))|0)!=0;
        if ($54) { __label__ = 12; break; } else { __label__ = 13; break; }
      case 13: // $55
        __label__ = 2; break;
      case 12: // $56
        __label__ = 11; break;
      case 11: // $57
        var $58=HEAP[$beg];
        var $59=HEAP[$end];
        var $60=unSign(($58), 32, 0) < unSign(($59), 32, 0);
        if ($60) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 14: // $61
        var $62=HEAP[$3];
        var $63=HEAP[$beg];
        var $64=($62+$63)&4294967295;
        var $65=HEAP[$end];
        var $66=HEAP[$beg];
        var $67=(($65) - ($66))&4294967295;
        var $68=_is_empty($64, $67);
        var $69=((($68))|0)!=0;
        if ($69) { __label__ = 16; break; } else { __label__ = 17; break; }
      case 16: // $70
        var $71=HEAP[$work];
        _bufputc($71, 10);
        __label__ = 18; break;
      case 17: // $72
        var $73=HEAP[$work];
        var $74=HEAP[$3];
        var $75=HEAP[$beg];
        var $76=($74+$75)&4294967295;
        var $77=HEAP[$end];
        var $78=HEAP[$beg];
        var $79=(($77) - ($78))&4294967295;
        _bufput($73, $76, $79);
        __label__ = 18; break;
      case 18: // $80
        __label__ = 15; break;
      case 15: // $81
        var $82=HEAP[$end];
        HEAP[$beg]=$82;
        __label__ = 0; break;
      case 2: // $83
        __label__ = 19; break;
      case 19: // $84
        var $85=HEAP[$work];
        var $86=($85+4)&4294967295;
        var $87=HEAP[$86];
        var $88=((($87))|0)!=0;
        if ($88) { __lastLabel__ = 19; __label__ = 20; break; } else { __lastLabel__ = 19; __label__ = 21; break; }
      case 20: // $89
        var $90=HEAP[$work];
        var $91=($90+4)&4294967295;
        var $92=HEAP[$91];
        var $93=(($92) - 1)&4294967295;
        var $94=HEAP[$work];
        var $95=($94)&4294967295;
        var $96=HEAP[$95];
        var $97=($96+$93)&4294967295;
        var $98=HEAP[$97];
        var $99=reSign(($98), 8, 0);
        var $100=((($99))|0)==10;
        __lastLabel__ = 20; __label__ = 21; break;
      case 21: // $101
        var $102=__lastLabel__ == 19 ? 0 : ($100);
        if ($102) { __label__ = 22; break; } else { __label__ = 23; break; }
      case 22: // $103
        var $104=HEAP[$work];
        var $105=($104+4)&4294967295;
        var $106=HEAP[$105];
        var $107=(($106) - 1)&4294967295;
        HEAP[$105]=$107;
        __label__ = 19; break;
      case 23: // $108
        var $109=HEAP[$work];
        _bufputc($109, 10);
        var $110=HEAP[$2];
        var $111=($110)&4294967295;
        var $112=($111)&4294967295;
        var $113=HEAP[$112];
        var $114=($113)!=0;
        if ($114) { __label__ = 24; break; } else { __label__ = 25; break; }
      case 24: // $115
        var $116=HEAP[$2];
        var $117=($116)&4294967295;
        var $118=($117)&4294967295;
        var $119=HEAP[$118];
        var $120=HEAP[$1];
        var $121=HEAP[$work];
        var $122=HEAP[$2];
        var $123=($122)&4294967295;
        var $124=($123+96)&4294967295;
        var $125=HEAP[$124];
        FUNCTION_TABLE[$119]($120, $121, 0, $125);
        __label__ = 25; break;
      case 25: // $126
        var $127=HEAP[$2];
        _rndr_popbuf($127);
        var $128=HEAP[$beg];
        STACKTOP = __stackBase__;
        return $128;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _prefix_uli($data, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 16);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $i=__stackBase__+12;
        HEAP[$2]=$data;
        HEAP[$3]=$size;
        HEAP[$i]=0;
        var $4=HEAP[$i];
        var $5=HEAP[$3];
        var $6=unSign(($4), 32, 0) < unSign(($5), 32, 0);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        var $8=HEAP[$i];
        var $9=HEAP[$2];
        var $10=($9+$8)&4294967295;
        var $11=HEAP[$10];
        var $12=reSign(($11), 8, 0);
        var $13=((($12))|0)==32;
        if ($13) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 2: // $14
        var $15=HEAP[$i];
        var $16=(($15) + 1)&4294967295;
        HEAP[$i]=$16;
        __label__ = 1; break;
      case 1: // $17
        var $18=HEAP[$i];
        var $19=HEAP[$3];
        var $20=unSign(($18), 32, 0) < unSign(($19), 32, 0);
        if ($20) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $21
        var $22=HEAP[$i];
        var $23=HEAP[$2];
        var $24=($23+$22)&4294967295;
        var $25=HEAP[$24];
        var $26=reSign(($25), 8, 0);
        var $27=((($26))|0)==32;
        if ($27) { __label__ = 5; break; } else { __label__ = 4; break; }
      case 5: // $28
        var $29=HEAP[$i];
        var $30=(($29) + 1)&4294967295;
        HEAP[$i]=$30;
        __label__ = 4; break;
      case 4: // $31
        var $32=HEAP[$i];
        var $33=HEAP[$3];
        var $34=unSign(($32), 32, 0) < unSign(($33), 32, 0);
        if ($34) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $35
        var $36=HEAP[$i];
        var $37=HEAP[$2];
        var $38=($37+$36)&4294967295;
        var $39=HEAP[$38];
        var $40=reSign(($39), 8, 0);
        var $41=((($40))|0)==32;
        if ($41) { __label__ = 8; break; } else { __label__ = 7; break; }
      case 8: // $42
        var $43=HEAP[$i];
        var $44=(($43) + 1)&4294967295;
        HEAP[$i]=$44;
        __label__ = 7; break;
      case 7: // $45
        var $46=HEAP[$i];
        var $47=(($46) + 1)&4294967295;
        var $48=HEAP[$3];
        var $49=unSign(($47), 32, 0) >= unSign(($48), 32, 0);
        if ($49) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 10: // $50
        var $51=HEAP[$i];
        var $52=HEAP[$2];
        var $53=($52+$51)&4294967295;
        var $54=HEAP[$53];
        var $55=reSign(($54), 8, 0);
        var $56=((($55))|0)!=42;
        if ($56) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $57
        var $58=HEAP[$i];
        var $59=HEAP[$2];
        var $60=($59+$58)&4294967295;
        var $61=HEAP[$60];
        var $62=reSign(($61), 8, 0);
        var $63=((($62))|0)!=43;
        if ($63) { __label__ = 13; break; } else { __label__ = 12; break; }
      case 13: // $64
        var $65=HEAP[$i];
        var $66=HEAP[$2];
        var $67=($66+$65)&4294967295;
        var $68=HEAP[$67];
        var $69=reSign(($68), 8, 0);
        var $70=((($69))|0)!=45;
        if ($70) { __label__ = 9; break; } else { __label__ = 12; break; }
      case 12: // $71
        var $72=HEAP[$i];
        var $73=(($72) + 1)&4294967295;
        var $74=HEAP[$2];
        var $75=($74+$73)&4294967295;
        var $76=HEAP[$75];
        var $77=reSign(($76), 8, 0);
        var $78=((($77))|0)!=32;
        if ($78) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 14: // $79
        var $80=HEAP[$i];
        var $81=(($80) + 1)&4294967295;
        var $82=HEAP[$2];
        var $83=($82+$81)&4294967295;
        var $84=HEAP[$83];
        var $85=reSign(($84), 8, 0);
        var $86=((($85))|0)!=9;
        if ($86) { __label__ = 9; break; } else { __label__ = 15; break; }
      case 9: // $87
        HEAP[$1]=0;
        __label__ = 16; break;
      case 15: // $88
        var $89=HEAP[$i];
        var $90=(($89) + 2)&4294967295;
        HEAP[$1]=$90;
        __label__ = 16; break;
      case 16: // $91
        var $92=HEAP[$1];
        STACKTOP = __stackBase__;
        return $92;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parse_list($ob, $rndr, $data, $size, $flags) {
    var __stackBase__  = STACKTOP; STACKTOP += 32; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 32);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $work=__stackBase__+20;
        var $i=__stackBase__+24;
        var $j=__stackBase__+28;
        HEAP[$1]=$ob;
        HEAP[$2]=$rndr;
        HEAP[$3]=$data;
        HEAP[$4]=$size;
        HEAP[$5]=$flags;
        HEAP[$work]=0;
        HEAP[$i]=0;
        var $6=HEAP[$2];
        var $7=_rndr_newbuf($6);
        HEAP[$work]=$7;
        __label__ = 0; break;
      case 0: // $8
        var $9=HEAP[$i];
        var $10=HEAP[$4];
        var $11=unSign(($9), 32, 0) < unSign(($10), 32, 0);
        if ($11) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $12
        var $13=HEAP[$work];
        var $14=HEAP[$2];
        var $15=HEAP[$3];
        var $16=HEAP[$i];
        var $17=($15+$16)&4294967295;
        var $18=HEAP[$4];
        var $19=HEAP[$i];
        var $20=(($18) - ($19))&4294967295;
        var $21=_parse_listitem($13, $14, $17, $20, $5);
        HEAP[$j]=$21;
        var $22=HEAP[$j];
        var $23=HEAP[$i];
        var $24=(($23) + ($22))&4294967295;
        HEAP[$i]=$24;
        var $25=HEAP[$j];
        var $26=((($25))|0)!=0;
        if ($26) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $27
        var $28=HEAP[$5];
        var $29=($28) & 8;
        var $30=((($29))|0)!=0;
        if ($30) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $31
        __label__ = 2; break;
      case 5: // $32
        __label__ = 0; break;
      case 2: // $33
        var $34=HEAP[$2];
        var $35=($34)&4294967295;
        var $36=($35+20)&4294967295;
        var $37=HEAP[$36];
        var $38=($37)!=0;
        if ($38) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $39
        var $40=HEAP[$2];
        var $41=($40)&4294967295;
        var $42=($41+20)&4294967295;
        var $43=HEAP[$42];
        var $44=HEAP[$1];
        var $45=HEAP[$work];
        var $46=HEAP[$5];
        var $47=HEAP[$2];
        var $48=($47)&4294967295;
        var $49=($48+96)&4294967295;
        var $50=HEAP[$49];
        FUNCTION_TABLE[$43]($44, $45, $46, $50);
        __label__ = 7; break;
      case 7: // $51
        var $52=HEAP[$2];
        _rndr_popbuf($52);
        var $53=HEAP[$i];
        STACKTOP = __stackBase__;
        return $53;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _prefix_oli($data, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 16);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $i=__stackBase__+12;
        HEAP[$2]=$data;
        HEAP[$3]=$size;
        HEAP[$i]=0;
        var $4=HEAP[$i];
        var $5=HEAP[$3];
        var $6=unSign(($4), 32, 0) < unSign(($5), 32, 0);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        var $8=HEAP[$i];
        var $9=HEAP[$2];
        var $10=($9+$8)&4294967295;
        var $11=HEAP[$10];
        var $12=reSign(($11), 8, 0);
        var $13=((($12))|0)==32;
        if ($13) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 2: // $14
        var $15=HEAP[$i];
        var $16=(($15) + 1)&4294967295;
        HEAP[$i]=$16;
        __label__ = 1; break;
      case 1: // $17
        var $18=HEAP[$i];
        var $19=HEAP[$3];
        var $20=unSign(($18), 32, 0) < unSign(($19), 32, 0);
        if ($20) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $21
        var $22=HEAP[$i];
        var $23=HEAP[$2];
        var $24=($23+$22)&4294967295;
        var $25=HEAP[$24];
        var $26=reSign(($25), 8, 0);
        var $27=((($26))|0)==32;
        if ($27) { __label__ = 5; break; } else { __label__ = 4; break; }
      case 5: // $28
        var $29=HEAP[$i];
        var $30=(($29) + 1)&4294967295;
        HEAP[$i]=$30;
        __label__ = 4; break;
      case 4: // $31
        var $32=HEAP[$i];
        var $33=HEAP[$3];
        var $34=unSign(($32), 32, 0) < unSign(($33), 32, 0);
        if ($34) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $35
        var $36=HEAP[$i];
        var $37=HEAP[$2];
        var $38=($37+$36)&4294967295;
        var $39=HEAP[$38];
        var $40=reSign(($39), 8, 0);
        var $41=((($40))|0)==32;
        if ($41) { __label__ = 8; break; } else { __label__ = 7; break; }
      case 8: // $42
        var $43=HEAP[$i];
        var $44=(($43) + 1)&4294967295;
        HEAP[$i]=$44;
        __label__ = 7; break;
      case 7: // $45
        var $46=HEAP[$i];
        var $47=HEAP[$3];
        var $48=unSign(($46), 32, 0) >= unSign(($47), 32, 0);
        if ($48) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 10: // $49
        var $50=HEAP[$i];
        var $51=HEAP[$2];
        var $52=($51+$50)&4294967295;
        var $53=HEAP[$52];
        var $54=reSign(($53), 8, 0);
        var $55=((($54))|0) < 48;
        if ($55) { __label__ = 9; break; } else { __label__ = 11; break; }
      case 11: // $56
        var $57=HEAP[$i];
        var $58=HEAP[$2];
        var $59=($58+$57)&4294967295;
        var $60=HEAP[$59];
        var $61=reSign(($60), 8, 0);
        var $62=((($61))|0) > 57;
        if ($62) { __label__ = 9; break; } else { __label__ = 12; break; }
      case 9: // $63
        HEAP[$1]=0;
        __label__ = 13; break;
      case 12: // $64
        __label__ = 14; break;
      case 14: // $65
        var $66=HEAP[$i];
        var $67=HEAP[$3];
        var $68=unSign(($66), 32, 0) < unSign(($67), 32, 0);
        if ($68) { __lastLabel__ = 14; __label__ = 15; break; } else { __lastLabel__ = 14; __label__ = 16; break; }
      case 15: // $69
        var $70=HEAP[$i];
        var $71=HEAP[$2];
        var $72=($71+$70)&4294967295;
        var $73=HEAP[$72];
        var $74=reSign(($73), 8, 0);
        var $75=((($74))|0) >= 48;
        if ($75) { __lastLabel__ = 15; __label__ = 17; break; } else { __lastLabel__ = 15; __label__ = 16; break; }
      case 17: // $76
        var $77=HEAP[$i];
        var $78=HEAP[$2];
        var $79=($78+$77)&4294967295;
        var $80=HEAP[$79];
        var $81=reSign(($80), 8, 0);
        var $82=((($81))|0) <= 57;
        __lastLabel__ = 17; __label__ = 16; break;
      case 16: // $83
        var $84=__lastLabel__ == 15 ? 0 : (__lastLabel__ == 14 ? 0 : ($82));
        if ($84) { __label__ = 18; break; } else { __label__ = 19; break; }
      case 18: // $85
        var $86=HEAP[$i];
        var $87=(($86) + 1)&4294967295;
        HEAP[$i]=$87;
        __label__ = 14; break;
      case 19: // $88
        var $89=HEAP[$i];
        var $90=(($89) + 1)&4294967295;
        var $91=HEAP[$3];
        var $92=unSign(($90), 32, 0) >= unSign(($91), 32, 0);
        if ($92) { __label__ = 20; break; } else { __label__ = 21; break; }
      case 21: // $93
        var $94=HEAP[$i];
        var $95=HEAP[$2];
        var $96=($95+$94)&4294967295;
        var $97=HEAP[$96];
        var $98=reSign(($97), 8, 0);
        var $99=((($98))|0)!=46;
        if ($99) { __label__ = 20; break; } else { __label__ = 22; break; }
      case 22: // $100
        var $101=HEAP[$i];
        var $102=(($101) + 1)&4294967295;
        var $103=HEAP[$2];
        var $104=($103+$102)&4294967295;
        var $105=HEAP[$104];
        var $106=reSign(($105), 8, 0);
        var $107=((($106))|0)!=32;
        if ($107) { __label__ = 23; break; } else { __label__ = 24; break; }
      case 23: // $108
        var $109=HEAP[$i];
        var $110=(($109) + 1)&4294967295;
        var $111=HEAP[$2];
        var $112=($111+$110)&4294967295;
        var $113=HEAP[$112];
        var $114=reSign(($113), 8, 0);
        var $115=((($114))|0)!=9;
        if ($115) { __label__ = 20; break; } else { __label__ = 24; break; }
      case 20: // $116
        HEAP[$1]=0;
        __label__ = 13; break;
      case 24: // $117
        var $118=HEAP[$i];
        var $119=(($118) + 2)&4294967295;
        HEAP[$1]=$119;
        __label__ = 13; break;
      case 13: // $120
        var $121=HEAP[$1];
        STACKTOP = __stackBase__;
        return $121;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parse_paragraph($ob, $rndr, $data, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 64; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 64);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $i=__stackBase__+16;
        var $end=__stackBase__+20;
        var $level=__stackBase__+24;
        var $work=__stackBase__+28;
        var $tmp=__stackBase__+48;
        var $header_work=__stackBase__+52;
        var $beg=__stackBase__+56;
        var $tmp1=__stackBase__+60;
        HEAP[$1]=$ob;
        HEAP[$2]=$rndr;
        HEAP[$3]=$data;
        HEAP[$4]=$size;
        HEAP[$i]=0;
        HEAP[$end]=0;
        HEAP[$level]=0;
        var $5=($work)&4294967295;
        var $6=HEAP[$3];
        HEAP[$5]=$6;
        var $7=($work+4)&4294967295;
        HEAP[$7]=0;
        var $8=($work+8)&4294967295;
        HEAP[$8]=0;
        var $9=($work+12)&4294967295;
        HEAP[$9]=0;
        var $10=($work+16)&4294967295;
        HEAP[$10]=0;
        __label__ = 0; break;
      case 0: // $11
        var $12=HEAP[$i];
        var $13=HEAP[$4];
        var $14=unSign(($12), 32, 0) < unSign(($13), 32, 0);
        if ($14) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $15
        var $16=HEAP[$i];
        var $17=(($16) + 1)&4294967295;
        HEAP[$end]=$17;
        __label__ = 3; break;
      case 3: // $18
        var $19=HEAP[$end];
        var $20=HEAP[$4];
        var $21=unSign(($19), 32, 0) < unSign(($20), 32, 0);
        if ($21) { __lastLabel__ = 3; __label__ = 4; break; } else { __lastLabel__ = 3; __label__ = 5; break; }
      case 4: // $22
        var $23=HEAP[$end];
        var $24=(($23) - 1)&4294967295;
        var $25=HEAP[$3];
        var $26=($25+$24)&4294967295;
        var $27=HEAP[$26];
        var $28=reSign(($27), 8, 0);
        var $29=((($28))|0)!=10;
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $30
        var $31=__lastLabel__ == 3 ? 0 : ($29);
        if ($31) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $32
        __label__ = 8; break;
      case 8: // $33
        var $34=HEAP[$end];
        var $35=(($34) + 1)&4294967295;
        HEAP[$end]=$35;
        __label__ = 3; break;
      case 7: // $36
        var $37=HEAP[$3];
        var $38=HEAP[$i];
        var $39=($37+$38)&4294967295;
        var $40=HEAP[$4];
        var $41=HEAP[$i];
        var $42=(($40) - ($41))&4294967295;
        var $43=_is_empty($39, $42);
        var $44=((($43))|0)!=0;
        if ($44) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 10: // $45
        var $46=HEAP[$3];
        var $47=HEAP[$i];
        var $48=($46+$47)&4294967295;
        var $49=HEAP[$4];
        var $50=HEAP[$i];
        var $51=(($49) - ($50))&4294967295;
        var $52=_is_headerline($48, $51);
        HEAP[$level]=$52;
        var $53=((($52))|0)!=0;
        if ($53) { __label__ = 9; break; } else { __label__ = 11; break; }
      case 9: // $54
        __label__ = 2; break;
      case 11: // $55
        var $56=HEAP[$2];
        var $57=($56+1152)&4294967295;
        var $58=HEAP[$57];
        var $59=($58) & 32;
        var $60=((($59))|0)!=0;
        if ($60) { __label__ = 12; break; } else { __label__ = 13; break; }
      case 12: // $61
        var $62=HEAP[$i];
        var $63=HEAP[$3];
        var $64=($63+$62)&4294967295;
        var $65=HEAP[$64];
        var $66=reSign(($65), 8, 0);
        var $67=((($66))|0)==60;
        if ($67) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 14: // $68
        var $69=HEAP[$2];
        var $70=($69)&4294967295;
        var $71=($70+8)&4294967295;
        var $72=HEAP[$71];
        var $73=($72)!=0;
        if ($73) { __label__ = 16; break; } else { __label__ = 15; break; }
      case 16: // $74
        var $75=HEAP[$1];
        var $76=HEAP[$2];
        var $77=HEAP[$3];
        var $78=HEAP[$i];
        var $79=($77+$78)&4294967295;
        var $80=HEAP[$4];
        var $81=HEAP[$i];
        var $82=(($80) - ($81))&4294967295;
        var $83=_parse_htmlblock($75, $76, $79, $82, 0);
        var $84=((($83))|0)!=0;
        if ($84) { __label__ = 17; break; } else { __label__ = 15; break; }
      case 17: // $85
        var $86=HEAP[$i];
        HEAP[$end]=$86;
        __label__ = 2; break;
      case 15: // $87
        __label__ = 13; break;
      case 13: // $88
        var $89=HEAP[$i];
        var $90=HEAP[$3];
        var $91=($90+$89)&4294967295;
        var $92=HEAP[$91];
        var $93=reSign(($92), 8, 0);
        var $94=((($93))|0)==35;
        if ($94) { __label__ = 18; break; } else { __label__ = 19; break; }
      case 19: // $95
        var $96=HEAP[$3];
        var $97=HEAP[$i];
        var $98=($96+$97)&4294967295;
        var $99=HEAP[$4];
        var $100=HEAP[$i];
        var $101=(($99) - ($100))&4294967295;
        var $102=_is_hrule($98, $101);
        var $103=((($102))|0)!=0;
        if ($103) { __label__ = 18; break; } else { __label__ = 20; break; }
      case 18: // $104
        var $105=HEAP[$i];
        HEAP[$end]=$105;
        __label__ = 2; break;
      case 20: // $106
        var $107=HEAP[$end];
        HEAP[$i]=$107;
        __label__ = 0; break;
      case 2: // $108
        var $109=HEAP[$i];
        var $110=($work+4)&4294967295;
        HEAP[$110]=$109;
        __label__ = 21; break;
      case 21: // $111
        var $112=($work+4)&4294967295;
        var $113=HEAP[$112];
        var $114=((($113))|0)!=0;
        if ($114) { __lastLabel__ = 21; __label__ = 22; break; } else { __lastLabel__ = 21; __label__ = 23; break; }
      case 22: // $115
        var $116=($work+4)&4294967295;
        var $117=HEAP[$116];
        var $118=(($117) - 1)&4294967295;
        var $119=HEAP[$3];
        var $120=($119+$118)&4294967295;
        var $121=HEAP[$120];
        var $122=reSign(($121), 8, 0);
        var $123=((($122))|0)==10;
        __lastLabel__ = 22; __label__ = 23; break;
      case 23: // $124
        var $125=__lastLabel__ == 21 ? 0 : ($123);
        if ($125) { __label__ = 24; break; } else { __label__ = 25; break; }
      case 24: // $126
        var $127=($work+4)&4294967295;
        var $128=HEAP[$127];
        var $129=(($128) + -1)&4294967295;
        HEAP[$127]=$129;
        __label__ = 21; break;
      case 25: // $130
        var $131=HEAP[$level];
        var $132=((($131))|0)!=0;
        if ($132) { __label__ = 26; break; } else { __label__ = 27; break; }
      case 27: // $133
        var $134=HEAP[$2];
        var $135=_rndr_newbuf($134);
        HEAP[$tmp]=$135;
        var $136=HEAP[$tmp];
        var $137=HEAP[$2];
        var $138=($work)&4294967295;
        var $139=HEAP[$138];
        var $140=($work+4)&4294967295;
        var $141=HEAP[$140];
        _parse_inline($136, $137, $139, $141);
        var $142=HEAP[$2];
        var $143=($142)&4294967295;
        var $144=($143+28)&4294967295;
        var $145=HEAP[$144];
        var $146=($145)!=0;
        if ($146) { __label__ = 28; break; } else { __label__ = 29; break; }
      case 28: // $147
        var $148=HEAP[$2];
        var $149=($148)&4294967295;
        var $150=($149+28)&4294967295;
        var $151=HEAP[$150];
        var $152=HEAP[$1];
        var $153=HEAP[$tmp];
        var $154=HEAP[$2];
        var $155=($154)&4294967295;
        var $156=($155+96)&4294967295;
        var $157=HEAP[$156];
        FUNCTION_TABLE[$151]($152, $153, $157);
        __label__ = 29; break;
      case 29: // $158
        var $159=HEAP[$2];
        _rndr_popbuf($159);
        __label__ = 30; break;
      case 26: // $160
        var $161=($work+4)&4294967295;
        var $162=HEAP[$161];
        var $163=((($162))|0)!=0;
        if ($163) { __label__ = 31; break; } else { __label__ = 32; break; }
      case 31: // $164
        var $165=($work+4)&4294967295;
        var $166=HEAP[$165];
        HEAP[$i]=$166;
        var $167=($work+4)&4294967295;
        var $168=HEAP[$167];
        var $169=(($168) - 1)&4294967295;
        HEAP[$167]=$169;
        __label__ = 33; break;
      case 33: // $170
        var $171=($work+4)&4294967295;
        var $172=HEAP[$171];
        var $173=((($172))|0)!=0;
        if ($173) { __lastLabel__ = 33; __label__ = 34; break; } else { __lastLabel__ = 33; __label__ = 35; break; }
      case 34: // $174
        var $175=($work+4)&4294967295;
        var $176=HEAP[$175];
        var $177=HEAP[$3];
        var $178=($177+$176)&4294967295;
        var $179=HEAP[$178];
        var $180=reSign(($179), 8, 0);
        var $181=((($180))|0)!=10;
        __lastLabel__ = 34; __label__ = 35; break;
      case 35: // $182
        var $183=__lastLabel__ == 33 ? 0 : ($181);
        if ($183) { __label__ = 36; break; } else { __label__ = 37; break; }
      case 36: // $184
        var $185=($work+4)&4294967295;
        var $186=HEAP[$185];
        var $187=(($186) - 1)&4294967295;
        HEAP[$185]=$187;
        __label__ = 33; break;
      case 37: // $188
        var $189=($work+4)&4294967295;
        var $190=HEAP[$189];
        var $191=(($190) + 1)&4294967295;
        HEAP[$beg]=$191;
        __label__ = 38; break;
      case 38: // $192
        var $193=($work+4)&4294967295;
        var $194=HEAP[$193];
        var $195=((($194))|0)!=0;
        if ($195) { __lastLabel__ = 38; __label__ = 39; break; } else { __lastLabel__ = 38; __label__ = 40; break; }
      case 39: // $196
        var $197=($work+4)&4294967295;
        var $198=HEAP[$197];
        var $199=(($198) - 1)&4294967295;
        var $200=HEAP[$3];
        var $201=($200+$199)&4294967295;
        var $202=HEAP[$201];
        var $203=reSign(($202), 8, 0);
        var $204=((($203))|0)==10;
        __lastLabel__ = 39; __label__ = 40; break;
      case 40: // $205
        var $206=__lastLabel__ == 38 ? 0 : ($204);
        if ($206) { __label__ = 41; break; } else { __label__ = 42; break; }
      case 41: // $207
        var $208=($work+4)&4294967295;
        var $209=HEAP[$208];
        var $210=(($209) - 1)&4294967295;
        HEAP[$208]=$210;
        __label__ = 38; break;
      case 42: // $211
        var $212=($work+4)&4294967295;
        var $213=HEAP[$212];
        var $214=unSign(($213), 32, 0) > 0;
        if ($214) { __label__ = 43; break; } else { __label__ = 44; break; }
      case 43: // $215
        var $216=HEAP[$2];
        var $217=_rndr_newbuf($216);
        HEAP[$tmp1]=$217;
        var $218=HEAP[$tmp1];
        var $219=HEAP[$2];
        var $220=($work)&4294967295;
        var $221=HEAP[$220];
        var $222=($work+4)&4294967295;
        var $223=HEAP[$222];
        _parse_inline($218, $219, $221, $223);
        var $224=HEAP[$2];
        var $225=($224)&4294967295;
        var $226=($225+28)&4294967295;
        var $227=HEAP[$226];
        var $228=($227)!=0;
        if ($228) { __label__ = 45; break; } else { __label__ = 46; break; }
      case 45: // $229
        var $230=HEAP[$2];
        var $231=($230)&4294967295;
        var $232=($231+28)&4294967295;
        var $233=HEAP[$232];
        var $234=HEAP[$1];
        var $235=HEAP[$tmp1];
        var $236=HEAP[$2];
        var $237=($236)&4294967295;
        var $238=($237+96)&4294967295;
        var $239=HEAP[$238];
        FUNCTION_TABLE[$233]($234, $235, $239);
        __label__ = 46; break;
      case 46: // $240
        var $241=HEAP[$2];
        _rndr_popbuf($241);
        var $242=HEAP[$beg];
        var $243=($work)&4294967295;
        var $244=HEAP[$243];
        var $245=($244+$242)&4294967295;
        HEAP[$243]=$245;
        var $246=HEAP[$i];
        var $247=HEAP[$beg];
        var $248=(($246) - ($247))&4294967295;
        var $249=($work+4)&4294967295;
        HEAP[$249]=$248;
        __label__ = 47; break;
      case 44: // $250
        var $251=HEAP[$i];
        var $252=($work+4)&4294967295;
        HEAP[$252]=$251;
        __label__ = 47; break;
      case 47: // $253
        __label__ = 32; break;
      case 32: // $254
        var $255=HEAP[$2];
        var $256=_rndr_newbuf($255);
        HEAP[$header_work]=$256;
        var $257=HEAP[$header_work];
        var $258=HEAP[$2];
        var $259=($work)&4294967295;
        var $260=HEAP[$259];
        var $261=($work+4)&4294967295;
        var $262=HEAP[$261];
        _parse_inline($257, $258, $260, $262);
        var $263=HEAP[$2];
        var $264=($263)&4294967295;
        var $265=($264+12)&4294967295;
        var $266=HEAP[$265];
        var $267=($266)!=0;
        if ($267) { __label__ = 48; break; } else { __label__ = 49; break; }
      case 48: // $268
        var $269=HEAP[$2];
        var $270=($269)&4294967295;
        var $271=($270+12)&4294967295;
        var $272=HEAP[$271];
        var $273=HEAP[$1];
        var $274=HEAP[$header_work];
        var $275=HEAP[$level];
        var $276=HEAP[$2];
        var $277=($276)&4294967295;
        var $278=($277+96)&4294967295;
        var $279=HEAP[$278];
        FUNCTION_TABLE[$272]($273, $274, $275, $279);
        __label__ = 49; break;
      case 49: // $280
        var $281=HEAP[$2];
        _rndr_popbuf($281);
        __label__ = 30; break;
      case 30: // $282
        var $283=HEAP[$end];
        STACKTOP = __stackBase__;
        return $283;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _is_headerline($data, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 16);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $i=__stackBase__+12;
        HEAP[$2]=$data;
        HEAP[$3]=$size;
        HEAP[$i]=0;
        var $4=HEAP[$i];
        var $5=HEAP[$2];
        var $6=($5+$4)&4294967295;
        var $7=HEAP[$6];
        var $8=reSign(($7), 8, 0);
        var $9=((($8))|0)==61;
        if ($9) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $10
        HEAP[$i]=1;
        __label__ = 2; break;
      case 2: // $11
        var $12=HEAP[$i];
        var $13=HEAP[$3];
        var $14=unSign(($12), 32, 0) < unSign(($13), 32, 0);
        if ($14) { __lastLabel__ = 2; __label__ = 3; break; } else { __lastLabel__ = 2; __label__ = 4; break; }
      case 3: // $15
        var $16=HEAP[$i];
        var $17=HEAP[$2];
        var $18=($17+$16)&4294967295;
        var $19=HEAP[$18];
        var $20=reSign(($19), 8, 0);
        var $21=((($20))|0)==61;
        __lastLabel__ = 3; __label__ = 4; break;
      case 4: // $22
        var $23=__lastLabel__ == 2 ? 0 : ($21);
        if ($23) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $24
        __label__ = 7; break;
      case 7: // $25
        var $26=HEAP[$i];
        var $27=(($26) + 1)&4294967295;
        HEAP[$i]=$27;
        __label__ = 2; break;
      case 6: // $28
        __label__ = 8; break;
      case 8: // $29
        var $30=HEAP[$i];
        var $31=HEAP[$3];
        var $32=unSign(($30), 32, 0) < unSign(($31), 32, 0);
        if ($32) { __lastLabel__ = 8; __label__ = 9; break; } else { __lastLabel__ = 8; __label__ = 10; break; }
      case 9: // $33
        var $34=HEAP[$i];
        var $35=HEAP[$2];
        var $36=($35+$34)&4294967295;
        var $37=HEAP[$36];
        var $38=reSign(($37), 8, 0);
        var $39=((($38))|0)==32;
        if ($39) { __lastLabel__ = 9; __label__ = 11; break; } else { __lastLabel__ = 9; __label__ = 12; break; }
      case 12: // $40
        var $41=HEAP[$i];
        var $42=HEAP[$2];
        var $43=($42+$41)&4294967295;
        var $44=HEAP[$43];
        var $45=reSign(($44), 8, 0);
        var $46=((($45))|0)==9;
        __lastLabel__ = 12; __label__ = 11; break;
      case 11: // $47
        var $48=__lastLabel__ == 9 ? 1 : ($46);
        __lastLabel__ = 11; __label__ = 10; break;
      case 10: // $49
        var $50=__lastLabel__ == 8 ? 0 : ($48);
        if ($50) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $51
        var $52=HEAP[$i];
        var $53=(($52) + 1)&4294967295;
        HEAP[$i]=$53;
        __label__ = 8; break;
      case 14: // $54
        var $55=HEAP[$i];
        var $56=HEAP[$3];
        var $57=unSign(($55), 32, 0) >= unSign(($56), 32, 0);
        if ($57) { __lastLabel__ = 14; __label__ = 15; break; } else { __lastLabel__ = 14; __label__ = 16; break; }
      case 16: // $58
        var $59=HEAP[$i];
        var $60=HEAP[$2];
        var $61=($60+$59)&4294967295;
        var $62=HEAP[$61];
        var $63=reSign(($62), 8, 0);
        var $64=((($63))|0)==10;
        __lastLabel__ = 16; __label__ = 15; break;
      case 15: // $65
        var $66=__lastLabel__ == 14 ? 1 : ($64);
        var $67=($66) ? 1 : 0;
        HEAP[$1]=$67;
        __label__ = 17; break;
      case 1: // $68
        var $69=HEAP[$i];
        var $70=HEAP[$2];
        var $71=($70+$69)&4294967295;
        var $72=HEAP[$71];
        var $73=reSign(($72), 8, 0);
        var $74=((($73))|0)==45;
        if ($74) { __label__ = 18; break; } else { __label__ = 19; break; }
      case 18: // $75
        HEAP[$i]=1;
        __label__ = 20; break;
      case 20: // $76
        var $77=HEAP[$i];
        var $78=HEAP[$3];
        var $79=unSign(($77), 32, 0) < unSign(($78), 32, 0);
        if ($79) { __lastLabel__ = 20; __label__ = 21; break; } else { __lastLabel__ = 20; __label__ = 22; break; }
      case 21: // $80
        var $81=HEAP[$i];
        var $82=HEAP[$2];
        var $83=($82+$81)&4294967295;
        var $84=HEAP[$83];
        var $85=reSign(($84), 8, 0);
        var $86=((($85))|0)==45;
        __lastLabel__ = 21; __label__ = 22; break;
      case 22: // $87
        var $88=__lastLabel__ == 20 ? 0 : ($86);
        if ($88) { __label__ = 23; break; } else { __label__ = 24; break; }
      case 23: // $89
        __label__ = 25; break;
      case 25: // $90
        var $91=HEAP[$i];
        var $92=(($91) + 1)&4294967295;
        HEAP[$i]=$92;
        __label__ = 20; break;
      case 24: // $93
        __label__ = 26; break;
      case 26: // $94
        var $95=HEAP[$i];
        var $96=HEAP[$3];
        var $97=unSign(($95), 32, 0) < unSign(($96), 32, 0);
        if ($97) { __lastLabel__ = 26; __label__ = 27; break; } else { __lastLabel__ = 26; __label__ = 28; break; }
      case 27: // $98
        var $99=HEAP[$i];
        var $100=HEAP[$2];
        var $101=($100+$99)&4294967295;
        var $102=HEAP[$101];
        var $103=reSign(($102), 8, 0);
        var $104=((($103))|0)==32;
        if ($104) { __lastLabel__ = 27; __label__ = 29; break; } else { __lastLabel__ = 27; __label__ = 30; break; }
      case 30: // $105
        var $106=HEAP[$i];
        var $107=HEAP[$2];
        var $108=($107+$106)&4294967295;
        var $109=HEAP[$108];
        var $110=reSign(($109), 8, 0);
        var $111=((($110))|0)==9;
        __lastLabel__ = 30; __label__ = 29; break;
      case 29: // $112
        var $113=__lastLabel__ == 27 ? 1 : ($111);
        __lastLabel__ = 29; __label__ = 28; break;
      case 28: // $114
        var $115=__lastLabel__ == 26 ? 0 : ($113);
        if ($115) { __label__ = 31; break; } else { __label__ = 32; break; }
      case 31: // $116
        var $117=HEAP[$i];
        var $118=(($117) + 1)&4294967295;
        HEAP[$i]=$118;
        __label__ = 26; break;
      case 32: // $119
        var $120=HEAP[$i];
        var $121=HEAP[$3];
        var $122=unSign(($120), 32, 0) >= unSign(($121), 32, 0);
        if ($122) { __lastLabel__ = 32; __label__ = 33; break; } else { __lastLabel__ = 32; __label__ = 34; break; }
      case 34: // $123
        var $124=HEAP[$i];
        var $125=HEAP[$2];
        var $126=($125+$124)&4294967295;
        var $127=HEAP[$126];
        var $128=reSign(($127), 8, 0);
        var $129=((($128))|0)==10;
        __lastLabel__ = 34; __label__ = 33; break;
      case 33: // $130
        var $131=__lastLabel__ == 32 ? 1 : ($129);
        var $132=($131) ? 2 : 0;
        HEAP[$1]=$132;
        __label__ = 17; break;
      case 19: // $133
        HEAP[$1]=0;
        __label__ = 17; break;
      case 17: // $134
        var $135=HEAP[$1];
        STACKTOP = __stackBase__;
        return $135;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_newbuf($rndr) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 8);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $work=__stackBase__+4;
        HEAP[$1]=$rndr;
        HEAP[$work]=0;
        var $2=HEAP[$1];
        var $3=($2+1140)&4294967295;
        var $4=($3+4)&4294967295;
        var $5=HEAP[$4];
        var $6=HEAP[$1];
        var $7=($6+1140)&4294967295;
        var $8=($7+8)&4294967295;
        var $9=HEAP[$8];
        var $10=((($5))|0) < ((($9))|0);
        if ($10) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $11
        var $12=HEAP[$1];
        var $13=($12+1140)&4294967295;
        var $14=($13+4)&4294967295;
        var $15=HEAP[$14];
        var $16=(($15) + 1)&4294967295;
        HEAP[$14]=$16;
        var $17=HEAP[$1];
        var $18=($17+1140)&4294967295;
        var $19=($18)&4294967295;
        var $20=HEAP[$19];
        var $21=($20+4*$15)&4294967295;
        var $22=HEAP[$21];
        var $23=$22;
        HEAP[$work]=$23;
        var $24=HEAP[$work];
        var $25=($24+4)&4294967295;
        HEAP[$25]=0;
        __label__ = 2; break;
      case 1: // $26
        var $27=_bufnew(64);
        HEAP[$work]=$27;
        var $28=HEAP[$1];
        var $29=($28+1140)&4294967295;
        var $30=HEAP[$work];
        var $31=$30;
        var $32=_parr_push($29, $31);
        __label__ = 2; break;
      case 2: // $33
        var $34=HEAP[$work];
        STACKTOP = __stackBase__;
        return $34;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parse_inline($ob, $rndr, $data, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 48; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 48);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $i=__stackBase__+16;
        var $end=__stackBase__+20;
        var $action=__stackBase__+24;
        var $work=__stackBase__+28;
        HEAP[$1]=$ob;
        HEAP[$2]=$rndr;
        HEAP[$3]=$data;
        HEAP[$4]=$size;
        HEAP[$i]=0;
        HEAP[$end]=0;
        HEAP[$action]=0;
        var $5=$work;
        _llvm_memset_p0i8_i32($5, 0, 20, 4, 0);
        var $6=HEAP[$2];
        var $7=($6+1140)&4294967295;
        var $8=($7+4)&4294967295;
        var $9=HEAP[$8];
        var $10=HEAP[$2];
        var $11=($10+1156)&4294967295;
        var $12=HEAP[$11];
        var $13=unSign(($9), 32, 0) > unSign(($12), 32, 0);
        if ($13) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $14
        __label__ = 2; break;
      case 1: // $15
        __label__ = 3; break;
      case 3: // $16
        var $17=HEAP[$i];
        var $18=HEAP[$4];
        var $19=unSign(($17), 32, 0) < unSign(($18), 32, 0);
        if ($19) { __label__ = 4; break; } else { __label__ = 2; break; }
      case 4: // $20
        __label__ = 5; break;
      case 5: // $21
        var $22=HEAP[$end];
        var $23=HEAP[$4];
        var $24=unSign(($22), 32, 0) < unSign(($23), 32, 0);
        if ($24) { __lastLabel__ = 5; __label__ = 6; break; } else { __lastLabel__ = 5; __label__ = 7; break; }
      case 6: // $25
        var $26=HEAP[$end];
        var $27=HEAP[$3];
        var $28=($27+$26)&4294967295;
        var $29=HEAP[$28];
        var $30=unSign(($29), 8, 0);
        var $31=HEAP[$2];
        var $32=($31+116)&4294967295;
        var $33=($32+$30*4)&4294967295;
        var $34=HEAP[$33];
        HEAP[$action]=$34;
        var $35=($34)==0;
        __lastLabel__ = 6; __label__ = 7; break;
      case 7: // $36
        var $37=__lastLabel__ == 5 ? 0 : ($35);
        if ($37) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $38
        var $39=HEAP[$end];
        var $40=(($39) + 1)&4294967295;
        HEAP[$end]=$40;
        __label__ = 5; break;
      case 9: // $41
        var $42=HEAP[$2];
        var $43=($42)&4294967295;
        var $44=($43+84)&4294967295;
        var $45=HEAP[$44];
        var $46=($45)!=0;
        if ($46) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $47
        var $48=HEAP[$3];
        var $49=HEAP[$i];
        var $50=($48+$49)&4294967295;
        var $51=($work)&4294967295;
        HEAP[$51]=$50;
        var $52=HEAP[$end];
        var $53=HEAP[$i];
        var $54=(($52) - ($53))&4294967295;
        var $55=($work+4)&4294967295;
        HEAP[$55]=$54;
        var $56=HEAP[$2];
        var $57=($56)&4294967295;
        var $58=($57+84)&4294967295;
        var $59=HEAP[$58];
        var $60=HEAP[$1];
        var $61=HEAP[$2];
        var $62=($61)&4294967295;
        var $63=($62+96)&4294967295;
        var $64=HEAP[$63];
        FUNCTION_TABLE[$59]($60, $work, $64);
        __label__ = 12; break;
      case 11: // $65
        var $66=HEAP[$1];
        var $67=HEAP[$3];
        var $68=HEAP[$i];
        var $69=($67+$68)&4294967295;
        var $70=HEAP[$end];
        var $71=HEAP[$i];
        var $72=(($70) - ($71))&4294967295;
        _bufput($66, $69, $72);
        __label__ = 12; break;
      case 12: // $73
        var $74=HEAP[$end];
        var $75=HEAP[$4];
        var $76=unSign(($74), 32, 0) >= unSign(($75), 32, 0);
        if ($76) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $77
        __label__ = 2; break;
      case 14: // $78
        var $79=HEAP[$end];
        HEAP[$i]=$79;
        var $80=HEAP[$action];
        var $81=HEAP[$1];
        var $82=HEAP[$2];
        var $83=HEAP[$3];
        var $84=HEAP[$i];
        var $85=($83+$84)&4294967295;
        var $86=HEAP[$i];
        var $87=HEAP[$4];
        var $88=HEAP[$i];
        var $89=(($87) - ($88))&4294967295;
        var $90=FUNCTION_TABLE[$80]($81, $82, $85, $86, $89);
        HEAP[$end]=$90;
        var $91=HEAP[$end];
        var $92=((($91))|0)!=0;
        if ($92) { __label__ = 15; break; } else { __label__ = 16; break; }
      case 16: // $93
        var $94=HEAP[$i];
        var $95=(($94) + 1)&4294967295;
        HEAP[$end]=$95;
        __label__ = 17; break;
      case 15: // $96
        var $97=HEAP[$end];
        var $98=HEAP[$i];
        var $99=(($98) + ($97))&4294967295;
        HEAP[$i]=$99;
        var $100=HEAP[$i];
        HEAP[$end]=$100;
        __label__ = 17; break;
      case 17: // $101
        __label__ = 3; break;
      case 2: // $102
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_popbuf($rndr) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 4);
    var __label__;
  
    var $1=__stackBase__;
    HEAP[$1]=$rndr;
    var $2=HEAP[$1];
    var $3=($2+1140)&4294967295;
    var $4=($3+4)&4294967295;
    var $5=HEAP[$4];
    var $6=(($5) + -1)&4294967295;
    HEAP[$4]=$6;
    STACKTOP = __stackBase__;
    return;
  }
  

  function _parse_listitem($ob, $rndr, $data, $size, $flags) {
    var __stackBase__  = STACKTOP; STACKTOP += 64; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 64);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $6=__stackBase__+20;
        var $work=__stackBase__+24;
        var $inter=__stackBase__+28;
        var $beg=__stackBase__+32;
        var $end=__stackBase__+36;
        var $pre=__stackBase__+40;
        var $sublist=__stackBase__+44;
        var $orgpre=__stackBase__+48;
        var $i=__stackBase__+52;
        var $in_empty=__stackBase__+56;
        var $has_inside_empty=__stackBase__+60;
        HEAP[$2]=$ob;
        HEAP[$3]=$rndr;
        HEAP[$4]=$data;
        HEAP[$5]=$size;
        HEAP[$6]=$flags;
        HEAP[$work]=0;
        HEAP[$inter]=0;
        HEAP[$beg]=0;
        HEAP[$sublist]=0;
        HEAP[$orgpre]=0;
        HEAP[$in_empty]=0;
        HEAP[$has_inside_empty]=0;
        __label__ = 0; break;
      case 0: // $7
        var $8=HEAP[$orgpre];
        var $9=unSign(($8), 32, 0) < 3;
        if ($9) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 1: // $10
        var $11=HEAP[$orgpre];
        var $12=HEAP[$5];
        var $13=unSign(($11), 32, 0) < unSign(($12), 32, 0);
        if ($13) { __lastLabel__ = 1; __label__ = 3; break; } else { __lastLabel__ = 1; __label__ = 2; break; }
      case 3: // $14
        var $15=HEAP[$orgpre];
        var $16=HEAP[$4];
        var $17=($16+$15)&4294967295;
        var $18=HEAP[$17];
        var $19=reSign(($18), 8, 0);
        var $20=((($19))|0)==32;
        __lastLabel__ = 3; __label__ = 2; break;
      case 2: // $21
        var $22=__lastLabel__ == 1 ? 0 : (__lastLabel__ == 0 ? 0 : ($20));
        if ($22) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $23
        var $24=HEAP[$orgpre];
        var $25=(($24) + 1)&4294967295;
        HEAP[$orgpre]=$25;
        __label__ = 0; break;
      case 5: // $26
        var $27=HEAP[$4];
        var $28=HEAP[$5];
        var $29=_prefix_uli($27, $28);
        HEAP[$beg]=$29;
        var $30=HEAP[$beg];
        var $31=((($30))|0)!=0;
        if ($31) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 7: // $32
        var $33=HEAP[$4];
        var $34=HEAP[$5];
        var $35=_prefix_oli($33, $34);
        HEAP[$beg]=$35;
        __label__ = 6; break;
      case 6: // $36
        var $37=HEAP[$beg];
        var $38=((($37))|0)!=0;
        if ($38) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 9: // $39
        HEAP[$1]=0;
        __label__ = 10; break;
      case 8: // $40
        var $41=HEAP[$beg];
        HEAP[$end]=$41;
        __label__ = 11; break;
      case 11: // $42
        var $43=HEAP[$end];
        var $44=HEAP[$5];
        var $45=unSign(($43), 32, 0) < unSign(($44), 32, 0);
        if ($45) { __lastLabel__ = 11; __label__ = 12; break; } else { __lastLabel__ = 11; __label__ = 13; break; }
      case 12: // $46
        var $47=HEAP[$end];
        var $48=(($47) - 1)&4294967295;
        var $49=HEAP[$4];
        var $50=($49+$48)&4294967295;
        var $51=HEAP[$50];
        var $52=reSign(($51), 8, 0);
        var $53=((($52))|0)!=10;
        __lastLabel__ = 12; __label__ = 13; break;
      case 13: // $54
        var $55=__lastLabel__ == 11 ? 0 : ($53);
        if ($55) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 14: // $56
        var $57=HEAP[$end];
        var $58=(($57) + 1)&4294967295;
        HEAP[$end]=$58;
        __label__ = 11; break;
      case 15: // $59
        var $60=HEAP[$3];
        var $61=_rndr_newbuf($60);
        HEAP[$work]=$61;
        var $62=HEAP[$3];
        var $63=_rndr_newbuf($62);
        HEAP[$inter]=$63;
        var $64=HEAP[$work];
        var $65=HEAP[$4];
        var $66=HEAP[$beg];
        var $67=($65+$66)&4294967295;
        var $68=HEAP[$end];
        var $69=HEAP[$beg];
        var $70=(($68) - ($69))&4294967295;
        _bufput($64, $67, $70);
        var $71=HEAP[$end];
        HEAP[$beg]=$71;
        __label__ = 16; break;
      case 16: // $72
        var $73=HEAP[$beg];
        var $74=HEAP[$5];
        var $75=unSign(($73), 32, 0) < unSign(($74), 32, 0);
        if ($75) { __label__ = 17; break; } else { __label__ = 18; break; }
      case 17: // $76
        var $77=HEAP[$end];
        var $78=(($77) + 1)&4294967295;
        HEAP[$end]=$78;
        __label__ = 19; break;
      case 19: // $79
        var $80=HEAP[$end];
        var $81=HEAP[$5];
        var $82=unSign(($80), 32, 0) < unSign(($81), 32, 0);
        if ($82) { __lastLabel__ = 19; __label__ = 20; break; } else { __lastLabel__ = 19; __label__ = 21; break; }
      case 20: // $83
        var $84=HEAP[$end];
        var $85=(($84) - 1)&4294967295;
        var $86=HEAP[$4];
        var $87=($86+$85)&4294967295;
        var $88=HEAP[$87];
        var $89=reSign(($88), 8, 0);
        var $90=((($89))|0)!=10;
        __lastLabel__ = 20; __label__ = 21; break;
      case 21: // $91
        var $92=__lastLabel__ == 19 ? 0 : ($90);
        if ($92) { __label__ = 22; break; } else { __label__ = 23; break; }
      case 22: // $93
        var $94=HEAP[$end];
        var $95=(($94) + 1)&4294967295;
        HEAP[$end]=$95;
        __label__ = 19; break;
      case 23: // $96
        var $97=HEAP[$4];
        var $98=HEAP[$beg];
        var $99=($97+$98)&4294967295;
        var $100=HEAP[$end];
        var $101=HEAP[$beg];
        var $102=(($100) - ($101))&4294967295;
        var $103=_is_empty($99, $102);
        var $104=((($103))|0)!=0;
        if ($104) { __label__ = 24; break; } else { __label__ = 25; break; }
      case 24: // $105
        HEAP[$in_empty]=1;
        var $106=HEAP[$end];
        HEAP[$beg]=$106;
        __label__ = 16; break;
      case 25: // $107
        HEAP[$i]=0;
        __label__ = 26; break;
      case 26: // $108
        var $109=HEAP[$i];
        var $110=unSign(($109), 32, 0) < 4;
        if ($110) { __lastLabel__ = 26; __label__ = 27; break; } else { __lastLabel__ = 26; __label__ = 28; break; }
      case 27: // $111
        var $112=HEAP[$beg];
        var $113=HEAP[$i];
        var $114=(($112) + ($113))&4294967295;
        var $115=HEAP[$end];
        var $116=unSign(($114), 32, 0) < unSign(($115), 32, 0);
        if ($116) { __lastLabel__ = 27; __label__ = 29; break; } else { __lastLabel__ = 27; __label__ = 28; break; }
      case 29: // $117
        var $118=HEAP[$beg];
        var $119=HEAP[$i];
        var $120=(($118) + ($119))&4294967295;
        var $121=HEAP[$4];
        var $122=($121+$120)&4294967295;
        var $123=HEAP[$122];
        var $124=reSign(($123), 8, 0);
        var $125=((($124))|0)==32;
        __lastLabel__ = 29; __label__ = 28; break;
      case 28: // $126
        var $127=__lastLabel__ == 27 ? 0 : (__lastLabel__ == 26 ? 0 : ($125));
        if ($127) { __label__ = 30; break; } else { __label__ = 31; break; }
      case 30: // $128
        var $129=HEAP[$i];
        var $130=(($129) + 1)&4294967295;
        HEAP[$i]=$130;
        __label__ = 26; break;
      case 31: // $131
        var $132=HEAP[$i];
        HEAP[$pre]=$132;
        var $133=HEAP[$beg];
        var $134=HEAP[$4];
        var $135=($134+$133)&4294967295;
        var $136=HEAP[$135];
        var $137=reSign(($136), 8, 0);
        var $138=((($137))|0)==9;
        if ($138) { __label__ = 32; break; } else { __label__ = 33; break; }
      case 32: // $139
        HEAP[$i]=1;
        HEAP[$pre]=8;
        __label__ = 33; break;
      case 33: // $140
        var $141=HEAP[$4];
        var $142=HEAP[$beg];
        var $143=($141+$142)&4294967295;
        var $144=HEAP[$i];
        var $145=($143+$144)&4294967295;
        var $146=HEAP[$end];
        var $147=HEAP[$beg];
        var $148=(($146) - ($147))&4294967295;
        var $149=HEAP[$i];
        var $150=(($148) - ($149))&4294967295;
        var $151=_prefix_uli($145, $150);
        var $152=((($151))|0)!=0;
        if ($152) { __label__ = 34; break; } else { __label__ = 35; break; }
      case 34: // $153
        var $154=HEAP[$4];
        var $155=HEAP[$beg];
        var $156=($154+$155)&4294967295;
        var $157=HEAP[$i];
        var $158=($156+$157)&4294967295;
        var $159=HEAP[$end];
        var $160=HEAP[$beg];
        var $161=(($159) - ($160))&4294967295;
        var $162=HEAP[$i];
        var $163=(($161) - ($162))&4294967295;
        var $164=_is_hrule($158, $163);
        var $165=((($164))|0)!=0;
        if ($165) { __label__ = 35; break; } else { __label__ = 36; break; }
      case 35: // $166
        var $167=HEAP[$4];
        var $168=HEAP[$beg];
        var $169=($167+$168)&4294967295;
        var $170=HEAP[$i];
        var $171=($169+$170)&4294967295;
        var $172=HEAP[$end];
        var $173=HEAP[$beg];
        var $174=(($172) - ($173))&4294967295;
        var $175=HEAP[$i];
        var $176=(($174) - ($175))&4294967295;
        var $177=_prefix_oli($171, $176);
        var $178=((($177))|0)!=0;
        if ($178) { __label__ = 36; break; } else { __label__ = 37; break; }
      case 36: // $179
        var $180=HEAP[$in_empty];
        var $181=((($180))|0)!=0;
        if ($181) { __label__ = 38; break; } else { __label__ = 39; break; }
      case 38: // $182
        HEAP[$has_inside_empty]=1;
        __label__ = 39; break;
      case 39: // $183
        var $184=HEAP[$pre];
        var $185=HEAP[$orgpre];
        var $186=((($184))|0)==((($185))|0);
        if ($186) { __label__ = 40; break; } else { __label__ = 41; break; }
      case 40: // $187
        __label__ = 18; break;
      case 41: // $188
        var $189=HEAP[$sublist];
        var $190=((($189))|0)!=0;
        if ($190) { __label__ = 42; break; } else { __label__ = 43; break; }
      case 43: // $191
        var $192=HEAP[$work];
        var $193=($192+4)&4294967295;
        var $194=HEAP[$193];
        HEAP[$sublist]=$194;
        __label__ = 42; break;
      case 42: // $195
        __label__ = 44; break;
      case 37: // $196
        var $197=HEAP[$in_empty];
        var $198=((($197))|0)!=0;
        if ($198) { __label__ = 45; break; } else { __label__ = 46; break; }
      case 45: // $199
        var $200=HEAP[$i];
        var $201=unSign(($200), 32, 0) < 4;
        if ($201) { __label__ = 47; break; } else { __label__ = 46; break; }
      case 47: // $202
        var $203=HEAP[$beg];
        var $204=HEAP[$4];
        var $205=($204+$203)&4294967295;
        var $206=HEAP[$205];
        var $207=reSign(($206), 8, 0);
        var $208=((($207))|0)!=9;
        if ($208) { __label__ = 48; break; } else { __label__ = 46; break; }
      case 48: // $209
        var $210=HEAP[$6];
        var $211=HEAP[$210];
        var $212=($211) | 8;
        HEAP[$210]=$212;
        __label__ = 18; break;
      case 46: // $213
        var $214=HEAP[$in_empty];
        var $215=((($214))|0)!=0;
        if ($215) { __label__ = 49; break; } else { __label__ = 50; break; }
      case 49: // $216
        var $217=HEAP[$work];
        _bufputc($217, 10);
        HEAP[$has_inside_empty]=1;
        __label__ = 50; break;
      case 50: // $218
        __label__ = 51; break;
      case 51: // $219
        __label__ = 44; break;
      case 44: // $220
        HEAP[$in_empty]=0;
        var $221=HEAP[$work];
        var $222=HEAP[$4];
        var $223=HEAP[$beg];
        var $224=($222+$223)&4294967295;
        var $225=HEAP[$i];
        var $226=($224+$225)&4294967295;
        var $227=HEAP[$end];
        var $228=HEAP[$beg];
        var $229=(($227) - ($228))&4294967295;
        var $230=HEAP[$i];
        var $231=(($229) - ($230))&4294967295;
        _bufput($221, $226, $231);
        var $232=HEAP[$end];
        HEAP[$beg]=$232;
        __label__ = 16; break;
      case 18: // $233
        var $234=HEAP[$has_inside_empty];
        var $235=((($234))|0)!=0;
        if ($235) { __label__ = 52; break; } else { __label__ = 53; break; }
      case 52: // $236
        var $237=HEAP[$6];
        var $238=HEAP[$237];
        var $239=($238) | 2;
        HEAP[$237]=$239;
        __label__ = 53; break;
      case 53: // $240
        var $241=HEAP[$6];
        var $242=HEAP[$241];
        var $243=($242) & 2;
        var $244=((($243))|0)!=0;
        if ($244) { __label__ = 54; break; } else { __label__ = 55; break; }
      case 54: // $245
        var $246=HEAP[$sublist];
        var $247=((($246))|0)!=0;
        if ($247) { __label__ = 56; break; } else { __label__ = 57; break; }
      case 56: // $248
        var $249=HEAP[$sublist];
        var $250=HEAP[$work];
        var $251=($250+4)&4294967295;
        var $252=HEAP[$251];
        var $253=unSign(($249), 32, 0) < unSign(($252), 32, 0);
        if ($253) { __label__ = 58; break; } else { __label__ = 57; break; }
      case 58: // $254
        var $255=HEAP[$inter];
        var $256=HEAP[$3];
        var $257=HEAP[$work];
        var $258=($257)&4294967295;
        var $259=HEAP[$258];
        var $260=HEAP[$sublist];
        _parse_block($255, $256, $259, $260);
        var $261=HEAP[$inter];
        var $262=HEAP[$3];
        var $263=HEAP[$work];
        var $264=($263)&4294967295;
        var $265=HEAP[$264];
        var $266=HEAP[$sublist];
        var $267=($265+$266)&4294967295;
        var $268=HEAP[$work];
        var $269=($268+4)&4294967295;
        var $270=HEAP[$269];
        var $271=HEAP[$sublist];
        var $272=(($270) - ($271))&4294967295;
        _parse_block($261, $262, $267, $272);
        __label__ = 59; break;
      case 57: // $273
        var $274=HEAP[$inter];
        var $275=HEAP[$3];
        var $276=HEAP[$work];
        var $277=($276)&4294967295;
        var $278=HEAP[$277];
        var $279=HEAP[$work];
        var $280=($279+4)&4294967295;
        var $281=HEAP[$280];
        _parse_block($274, $275, $278, $281);
        __label__ = 59; break;
      case 59: // $282
        __label__ = 60; break;
      case 55: // $283
        var $284=HEAP[$sublist];
        var $285=((($284))|0)!=0;
        if ($285) { __label__ = 61; break; } else { __label__ = 62; break; }
      case 61: // $286
        var $287=HEAP[$sublist];
        var $288=HEAP[$work];
        var $289=($288+4)&4294967295;
        var $290=HEAP[$289];
        var $291=unSign(($287), 32, 0) < unSign(($290), 32, 0);
        if ($291) { __label__ = 63; break; } else { __label__ = 62; break; }
      case 63: // $292
        var $293=HEAP[$inter];
        var $294=HEAP[$3];
        var $295=HEAP[$work];
        var $296=($295)&4294967295;
        var $297=HEAP[$296];
        var $298=HEAP[$sublist];
        _parse_inline($293, $294, $297, $298);
        var $299=HEAP[$inter];
        var $300=HEAP[$3];
        var $301=HEAP[$work];
        var $302=($301)&4294967295;
        var $303=HEAP[$302];
        var $304=HEAP[$sublist];
        var $305=($303+$304)&4294967295;
        var $306=HEAP[$work];
        var $307=($306+4)&4294967295;
        var $308=HEAP[$307];
        var $309=HEAP[$sublist];
        var $310=(($308) - ($309))&4294967295;
        _parse_block($299, $300, $305, $310);
        __label__ = 64; break;
      case 62: // $311
        var $312=HEAP[$inter];
        var $313=HEAP[$3];
        var $314=HEAP[$work];
        var $315=($314)&4294967295;
        var $316=HEAP[$315];
        var $317=HEAP[$work];
        var $318=($317+4)&4294967295;
        var $319=HEAP[$318];
        _parse_inline($312, $313, $316, $319);
        __label__ = 64; break;
      case 64: // $320
        __label__ = 60; break;
      case 60: // $321
        var $322=HEAP[$3];
        var $323=($322)&4294967295;
        var $324=($323+24)&4294967295;
        var $325=HEAP[$324];
        var $326=($325)!=0;
        if ($326) { __label__ = 65; break; } else { __label__ = 66; break; }
      case 65: // $327
        var $328=HEAP[$3];
        var $329=($328)&4294967295;
        var $330=($329+24)&4294967295;
        var $331=HEAP[$330];
        var $332=HEAP[$2];
        var $333=HEAP[$inter];
        var $334=HEAP[$6];
        var $335=HEAP[$334];
        var $336=HEAP[$3];
        var $337=($336)&4294967295;
        var $338=($337+96)&4294967295;
        var $339=HEAP[$338];
        FUNCTION_TABLE[$331]($332, $333, $335, $339);
        __label__ = 66; break;
      case 66: // $340
        var $341=HEAP[$3];
        _rndr_popbuf($341);
        var $342=HEAP[$3];
        _rndr_popbuf($342);
        var $343=HEAP[$beg];
        HEAP[$1]=$343;
        __label__ = 10; break;
      case 10: // $344
        var $345=HEAP[$1];
        STACKTOP = __stackBase__;
        return $345;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parse_table_header($ob, $rndr, $data, $size, $columns, $column_data) {
    var __stackBase__  = STACKTOP; STACKTOP += 48; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 48);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $6=__stackBase__+20;
        var $7=__stackBase__+24;
        var $pipes=__stackBase__+28;
        var $i=__stackBase__+32;
        var $col=__stackBase__+36;
        var $header_end=__stackBase__+40;
        var $under_end=__stackBase__+44;
        HEAP[$2]=$ob;
        HEAP[$3]=$rndr;
        HEAP[$4]=$data;
        HEAP[$5]=$size;
        HEAP[$6]=$columns;
        HEAP[$7]=$column_data;
        HEAP[$i]=0;
        HEAP[$pipes]=0;
        __label__ = 0; break;
      case 0: // $8
        var $9=HEAP[$i];
        var $10=HEAP[$5];
        var $11=unSign(($9), 32, 0) < unSign(($10), 32, 0);
        if ($11) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 1: // $12
        var $13=HEAP[$i];
        var $14=HEAP[$4];
        var $15=($14+$13)&4294967295;
        var $16=HEAP[$15];
        var $17=reSign(($16), 8, 0);
        var $18=((($17))|0)!=10;
        __lastLabel__ = 1; __label__ = 2; break;
      case 2: // $19
        var $20=__lastLabel__ == 0 ? 0 : ($18);
        if ($20) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $21
        var $22=HEAP[$i];
        var $23=(($22) + 1)&4294967295;
        HEAP[$i]=$23;
        var $24=HEAP[$4];
        var $25=($24+$22)&4294967295;
        var $26=HEAP[$25];
        var $27=reSign(($26), 8, 0);
        var $28=((($27))|0)==124;
        if ($28) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $29
        var $30=HEAP[$pipes];
        var $31=(($30) + 1)&4294967295;
        HEAP[$pipes]=$31;
        __label__ = 6; break;
      case 6: // $32
        __label__ = 0; break;
      case 4: // $33
        var $34=HEAP[$i];
        var $35=HEAP[$5];
        var $36=((($34))|0)==((($35))|0);
        if ($36) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 8: // $37
        var $38=HEAP[$pipes];
        var $39=((($38))|0)==0;
        if ($39) { __label__ = 7; break; } else { __label__ = 9; break; }
      case 7: // $40
        HEAP[$1]=0;
        __label__ = 10; break;
      case 9: // $41
        var $42=HEAP[$i];
        HEAP[$header_end]=$42;
        var $43=HEAP[$4];
        var $44=($43)&4294967295;
        var $45=HEAP[$44];
        var $46=reSign(($45), 8, 0);
        var $47=((($46))|0)==124;
        if ($47) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $48
        var $49=HEAP[$pipes];
        var $50=(($49) + -1)&4294967295;
        HEAP[$pipes]=$50;
        __label__ = 12; break;
      case 12: // $51
        var $52=HEAP[$i];
        var $53=unSign(($52), 32, 0) > 2;
        if ($53) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $54
        var $55=HEAP[$i];
        var $56=(($55) - 1)&4294967295;
        var $57=HEAP[$4];
        var $58=($57+$56)&4294967295;
        var $59=HEAP[$58];
        var $60=reSign(($59), 8, 0);
        var $61=((($60))|0)==124;
        if ($61) { __label__ = 15; break; } else { __label__ = 14; break; }
      case 15: // $62
        var $63=HEAP[$pipes];
        var $64=(($63) + -1)&4294967295;
        HEAP[$pipes]=$64;
        __label__ = 14; break;
      case 14: // $65
        var $66=HEAP[$pipes];
        var $67=(($66) + 1)&4294967295;
        var $68=HEAP[$6];
        HEAP[$68]=$67;
        var $69=HEAP[$6];
        var $70=HEAP[$69];
        var $71=_calloc($70, 4);
        var $72=$71;
        var $73=HEAP[$7];
        HEAP[$73]=$72;
        var $74=HEAP[$i];
        var $75=(($74) + 1)&4294967295;
        HEAP[$i]=$75;
        var $76=HEAP[$i];
        var $77=HEAP[$5];
        var $78=unSign(($76), 32, 0) < unSign(($77), 32, 0);
        if ($78) { __label__ = 16; break; } else { __label__ = 17; break; }
      case 16: // $79
        var $80=HEAP[$i];
        var $81=HEAP[$4];
        var $82=($81+$80)&4294967295;
        var $83=HEAP[$82];
        var $84=reSign(($83), 8, 0);
        var $85=((($84))|0)==124;
        if ($85) { __label__ = 18; break; } else { __label__ = 17; break; }
      case 18: // $86
        var $87=HEAP[$i];
        var $88=(($87) + 1)&4294967295;
        HEAP[$i]=$88;
        __label__ = 17; break;
      case 17: // $89
        var $90=HEAP[$i];
        HEAP[$under_end]=$90;
        __label__ = 19; break;
      case 19: // $91
        var $92=HEAP[$under_end];
        var $93=HEAP[$5];
        var $94=unSign(($92), 32, 0) < unSign(($93), 32, 0);
        if ($94) { __lastLabel__ = 19; __label__ = 20; break; } else { __lastLabel__ = 19; __label__ = 21; break; }
      case 20: // $95
        var $96=HEAP[$under_end];
        var $97=HEAP[$4];
        var $98=($97+$96)&4294967295;
        var $99=HEAP[$98];
        var $100=reSign(($99), 8, 0);
        var $101=((($100))|0)!=10;
        __lastLabel__ = 20; __label__ = 21; break;
      case 21: // $102
        var $103=__lastLabel__ == 19 ? 0 : ($101);
        if ($103) { __label__ = 22; break; } else { __label__ = 23; break; }
      case 22: // $104
        var $105=HEAP[$under_end];
        var $106=(($105) + 1)&4294967295;
        HEAP[$under_end]=$106;
        __label__ = 19; break;
      case 23: // $107
        HEAP[$col]=0;
        __label__ = 24; break;
      case 24: // $108
        var $109=HEAP[$col];
        var $110=HEAP[$6];
        var $111=HEAP[$110];
        var $112=unSign(($109), 32, 0) < unSign(($111), 32, 0);
        if ($112) { __lastLabel__ = 24; __label__ = 25; break; } else { __lastLabel__ = 24; __label__ = 26; break; }
      case 25: // $113
        var $114=HEAP[$i];
        var $115=HEAP[$under_end];
        var $116=unSign(($114), 32, 0) < unSign(($115), 32, 0);
        __lastLabel__ = 25; __label__ = 26; break;
      case 26: // $117
        var $118=__lastLabel__ == 24 ? 0 : ($116);
        if ($118) { __label__ = 27; break; } else { __label__ = 28; break; }
      case 27: // $119
        var $120=HEAP[$i];
        var $121=HEAP[$4];
        var $122=($121+$120)&4294967295;
        var $123=HEAP[$122];
        var $124=reSign(($123), 8, 0);
        var $125=((($124))|0)==58;
        if ($125) { __label__ = 29; break; } else { __label__ = 30; break; }
      case 29: // $126
        var $127=HEAP[$i];
        var $128=(($127) + 1)&4294967295;
        HEAP[$i]=$128;
        var $129=HEAP[$col];
        var $130=HEAP[$7];
        var $131=HEAP[$130];
        var $132=($131+4*$129)&4294967295;
        var $133=HEAP[$132];
        var $134=($133) | 1;
        HEAP[$132]=$134;
        __label__ = 30; break;
      case 30: // $135
        __label__ = 31; break;
      case 31: // $136
        var $137=HEAP[$i];
        var $138=HEAP[$under_end];
        var $139=unSign(($137), 32, 0) < unSign(($138), 32, 0);
        if ($139) { __lastLabel__ = 31; __label__ = 32; break; } else { __lastLabel__ = 31; __label__ = 33; break; }
      case 32: // $140
        var $141=HEAP[$i];
        var $142=HEAP[$4];
        var $143=($142+$141)&4294967295;
        var $144=HEAP[$143];
        var $145=reSign(($144), 8, 0);
        var $146=((($145))|0)==45;
        __lastLabel__ = 32; __label__ = 33; break;
      case 33: // $147
        var $148=__lastLabel__ == 31 ? 0 : ($146);
        if ($148) { __label__ = 34; break; } else { __label__ = 35; break; }
      case 34: // $149
        var $150=HEAP[$i];
        var $151=(($150) + 1)&4294967295;
        HEAP[$i]=$151;
        __label__ = 31; break;
      case 35: // $152
        var $153=HEAP[$i];
        var $154=HEAP[$under_end];
        var $155=unSign(($153), 32, 0) < unSign(($154), 32, 0);
        if ($155) { __label__ = 36; break; } else { __label__ = 37; break; }
      case 36: // $156
        var $157=HEAP[$i];
        var $158=HEAP[$4];
        var $159=($158+$157)&4294967295;
        var $160=HEAP[$159];
        var $161=reSign(($160), 8, 0);
        var $162=((($161))|0)==58;
        if ($162) { __label__ = 38; break; } else { __label__ = 37; break; }
      case 38: // $163
        var $164=HEAP[$i];
        var $165=(($164) + 1)&4294967295;
        HEAP[$i]=$165;
        var $166=HEAP[$col];
        var $167=HEAP[$7];
        var $168=HEAP[$167];
        var $169=($168+4*$166)&4294967295;
        var $170=HEAP[$169];
        var $171=($170) | 2;
        HEAP[$169]=$171;
        __label__ = 37; break;
      case 37: // $172
        var $173=HEAP[$i];
        var $174=HEAP[$under_end];
        var $175=unSign(($173), 32, 0) < unSign(($174), 32, 0);
        if ($175) { __label__ = 39; break; } else { __label__ = 40; break; }
      case 39: // $176
        var $177=HEAP[$i];
        var $178=HEAP[$4];
        var $179=($178+$177)&4294967295;
        var $180=HEAP[$179];
        var $181=reSign(($180), 8, 0);
        var $182=((($181))|0)!=124;
        if ($182) { __label__ = 41; break; } else { __label__ = 40; break; }
      case 41: // $183
        __label__ = 28; break;
      case 40: // $184
        var $185=HEAP[$i];
        var $186=(($185) + 1)&4294967295;
        HEAP[$i]=$186;
        __label__ = 42; break;
      case 42: // $187
        var $188=HEAP[$col];
        var $189=(($188) + 1)&4294967295;
        HEAP[$col]=$189;
        __label__ = 24; break;
      case 28: // $190
        var $191=HEAP[$col];
        var $192=HEAP[$6];
        var $193=HEAP[$192];
        var $194=unSign(($191), 32, 0) < unSign(($193), 32, 0);
        if ($194) { __label__ = 43; break; } else { __label__ = 44; break; }
      case 43: // $195
        HEAP[$1]=0;
        __label__ = 10; break;
      case 44: // $196
        var $197=HEAP[$2];
        var $198=HEAP[$3];
        var $199=HEAP[$4];
        var $200=HEAP[$header_end];
        var $201=HEAP[$6];
        var $202=HEAP[$201];
        var $203=HEAP[$7];
        var $204=HEAP[$203];
        _parse_table_row($197, $198, $199, $200, $202, $204);
        var $205=HEAP[$under_end];
        var $206=(($205) + 1)&4294967295;
        HEAP[$1]=$206;
        __label__ = 10; break;
      case 10: // $207
        var $208=HEAP[$1];
        STACKTOP = __stackBase__;
        return $208;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parse_table_row($ob, $rndr, $data, $size, $columns, $col_data) {
    var __stackBase__  = STACKTOP; STACKTOP += 68; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 68);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $6=__stackBase__+20;
        var $i=__stackBase__+24;
        var $col=__stackBase__+28;
        var $row_work=__stackBase__+32;
        var $cell_start=__stackBase__+36;
        var $cell_end=__stackBase__+40;
        var $cell_work=__stackBase__+44;
        var $empty_cell=__stackBase__+48;
        HEAP[$1]=$ob;
        HEAP[$2]=$rndr;
        HEAP[$3]=$data;
        HEAP[$4]=$size;
        HEAP[$5]=$columns;
        HEAP[$6]=$col_data;
        HEAP[$i]=0;
        HEAP[$row_work]=0;
        var $7=HEAP[$2];
        var $8=_rndr_newbuf($7);
        HEAP[$row_work]=$8;
        var $9=HEAP[$i];
        var $10=HEAP[$4];
        var $11=unSign(($9), 32, 0) < unSign(($10), 32, 0);
        if ($11) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $12
        var $13=HEAP[$i];
        var $14=HEAP[$3];
        var $15=($14+$13)&4294967295;
        var $16=HEAP[$15];
        var $17=reSign(($16), 8, 0);
        var $18=((($17))|0)==124;
        if ($18) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 2: // $19
        var $20=HEAP[$i];
        var $21=(($20) + 1)&4294967295;
        HEAP[$i]=$21;
        __label__ = 1; break;
      case 1: // $22
        HEAP[$col]=0;
        __label__ = 3; break;
      case 3: // $23
        var $24=HEAP[$col];
        var $25=HEAP[$5];
        var $26=unSign(($24), 32, 0) < unSign(($25), 32, 0);
        if ($26) { __lastLabel__ = 3; __label__ = 4; break; } else { __lastLabel__ = 3; __label__ = 5; break; }
      case 4: // $27
        var $28=HEAP[$i];
        var $29=HEAP[$4];
        var $30=unSign(($28), 32, 0) < unSign(($29), 32, 0);
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $31
        var $32=__lastLabel__ == 3 ? 0 : ($30);
        if ($32) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $33
        var $34=HEAP[$2];
        var $35=_rndr_newbuf($34);
        HEAP[$cell_work]=$35;
        __label__ = 8; break;
      case 8: // $36
        var $37=HEAP[$i];
        var $38=HEAP[$4];
        var $39=unSign(($37), 32, 0) < unSign(($38), 32, 0);
        if ($39) { __lastLabel__ = 8; __label__ = 9; break; } else { __lastLabel__ = 8; __label__ = 10; break; }
      case 9: // $40
        var $41=HEAP[$i];
        var $42=HEAP[$3];
        var $43=($42+$41)&4294967295;
        var $44=HEAP[$43];
        var $45=reSign(($44), 8, 0);
        var $46=_isspace($45);
        var $47=((($46))|0)!=0;
        __lastLabel__ = 9; __label__ = 10; break;
      case 10: // $48
        var $49=__lastLabel__ == 8 ? 0 : ($47);
        if ($49) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $50
        var $51=HEAP[$i];
        var $52=(($51) + 1)&4294967295;
        HEAP[$i]=$52;
        __label__ = 8; break;
      case 12: // $53
        var $54=HEAP[$i];
        HEAP[$cell_start]=$54;
        __label__ = 13; break;
      case 13: // $55
        var $56=HEAP[$i];
        var $57=HEAP[$4];
        var $58=unSign(($56), 32, 0) < unSign(($57), 32, 0);
        if ($58) { __lastLabel__ = 13; __label__ = 14; break; } else { __lastLabel__ = 13; __label__ = 15; break; }
      case 14: // $59
        var $60=HEAP[$i];
        var $61=HEAP[$3];
        var $62=($61+$60)&4294967295;
        var $63=HEAP[$62];
        var $64=reSign(($63), 8, 0);
        var $65=((($64))|0)!=124;
        __lastLabel__ = 14; __label__ = 15; break;
      case 15: // $66
        var $67=__lastLabel__ == 13 ? 0 : ($65);
        if ($67) { __label__ = 16; break; } else { __label__ = 17; break; }
      case 16: // $68
        var $69=HEAP[$i];
        var $70=(($69) + 1)&4294967295;
        HEAP[$i]=$70;
        __label__ = 13; break;
      case 17: // $71
        var $72=HEAP[$i];
        var $73=(($72) - 1)&4294967295;
        HEAP[$cell_end]=$73;
        __label__ = 18; break;
      case 18: // $74
        var $75=HEAP[$cell_end];
        var $76=HEAP[$cell_start];
        var $77=unSign(($75), 32, 0) > unSign(($76), 32, 0);
        if ($77) { __lastLabel__ = 18; __label__ = 19; break; } else { __lastLabel__ = 18; __label__ = 20; break; }
      case 19: // $78
        var $79=HEAP[$cell_end];
        var $80=HEAP[$3];
        var $81=($80+$79)&4294967295;
        var $82=HEAP[$81];
        var $83=reSign(($82), 8, 0);
        var $84=_isspace($83);
        var $85=((($84))|0)!=0;
        __lastLabel__ = 19; __label__ = 20; break;
      case 20: // $86
        var $87=__lastLabel__ == 18 ? 0 : ($85);
        if ($87) { __label__ = 21; break; } else { __label__ = 22; break; }
      case 21: // $88
        var $89=HEAP[$cell_end];
        var $90=(($89) + -1)&4294967295;
        HEAP[$cell_end]=$90;
        __label__ = 18; break;
      case 22: // $91
        var $92=HEAP[$cell_work];
        var $93=HEAP[$2];
        var $94=HEAP[$3];
        var $95=HEAP[$cell_start];
        var $96=($94+$95)&4294967295;
        var $97=HEAP[$cell_end];
        var $98=(1 + ($97))&4294967295;
        var $99=HEAP[$cell_start];
        var $100=(($98) - ($99))&4294967295;
        _parse_inline($92, $93, $96, $100);
        var $101=HEAP[$2];
        var $102=($101)&4294967295;
        var $103=($102+40)&4294967295;
        var $104=HEAP[$103];
        var $105=($104)!=0;
        if ($105) { __label__ = 23; break; } else { __label__ = 24; break; }
      case 23: // $106
        var $107=HEAP[$2];
        var $108=($107)&4294967295;
        var $109=($108+40)&4294967295;
        var $110=HEAP[$109];
        var $111=HEAP[$row_work];
        var $112=HEAP[$cell_work];
        var $113=HEAP[$6];
        var $114=($113)!=0;
        if ($114) { __label__ = 25; break; } else { __label__ = 26; break; }
      case 25: // $115
        var $116=HEAP[$col];
        var $117=HEAP[$6];
        var $118=($117+4*$116)&4294967295;
        var $119=HEAP[$118];
        __lastLabel__ = 25; __label__ = 27; break;
      case 26: // $120
        __lastLabel__ = 26; __label__ = 27; break;
      case 27: // $121
        var $122=__lastLabel__ == 25 ? $119 : (0);
        var $123=HEAP[$2];
        var $124=($123)&4294967295;
        var $125=($124+96)&4294967295;
        var $126=HEAP[$125];
        FUNCTION_TABLE[$110]($111, $112, $122, $126);
        __label__ = 24; break;
      case 24: // $127
        var $128=HEAP[$2];
        _rndr_popbuf($128);
        var $129=HEAP[$i];
        var $130=(($129) + 1)&4294967295;
        HEAP[$i]=$130;
        __label__ = 28; break;
      case 28: // $131
        var $132=HEAP[$col];
        var $133=(($132) + 1)&4294967295;
        HEAP[$col]=$133;
        __label__ = 3; break;
      case 7: // $134
        __label__ = 29; break;
      case 29: // $135
        var $136=HEAP[$col];
        var $137=HEAP[$5];
        var $138=unSign(($136), 32, 0) < unSign(($137), 32, 0);
        if ($138) { __label__ = 30; break; } else { __label__ = 31; break; }
      case 30: // $139
        var $140=$empty_cell;
        _llvm_memset_p0i8_i32($140, 0, 20, 4, 0);
        var $141=HEAP[$2];
        var $142=($141)&4294967295;
        var $143=($142+40)&4294967295;
        var $144=HEAP[$143];
        var $145=($144)!=0;
        if ($145) { __label__ = 32; break; } else { __label__ = 33; break; }
      case 32: // $146
        var $147=HEAP[$2];
        var $148=($147)&4294967295;
        var $149=($148+40)&4294967295;
        var $150=HEAP[$149];
        var $151=HEAP[$row_work];
        var $152=HEAP[$6];
        var $153=($152)!=0;
        if ($153) { __label__ = 34; break; } else { __label__ = 35; break; }
      case 34: // $154
        var $155=HEAP[$col];
        var $156=HEAP[$6];
        var $157=($156+4*$155)&4294967295;
        var $158=HEAP[$157];
        __lastLabel__ = 34; __label__ = 36; break;
      case 35: // $159
        __lastLabel__ = 35; __label__ = 36; break;
      case 36: // $160
        var $161=__lastLabel__ == 34 ? $158 : (0);
        var $162=HEAP[$2];
        var $163=($162)&4294967295;
        var $164=($163+96)&4294967295;
        var $165=HEAP[$164];
        FUNCTION_TABLE[$150]($151, $empty_cell, $161, $165);
        __label__ = 33; break;
      case 33: // $166
        __label__ = 37; break;
      case 37: // $167
        var $168=HEAP[$col];
        var $169=(($168) + 1)&4294967295;
        HEAP[$col]=$169;
        __label__ = 29; break;
      case 31: // $170
        var $171=HEAP[$2];
        var $172=($171)&4294967295;
        var $173=($172+36)&4294967295;
        var $174=HEAP[$173];
        var $175=($174)!=0;
        if ($175) { __label__ = 38; break; } else { __label__ = 39; break; }
      case 38: // $176
        var $177=HEAP[$2];
        var $178=($177)&4294967295;
        var $179=($178+36)&4294967295;
        var $180=HEAP[$179];
        var $181=HEAP[$1];
        var $182=HEAP[$row_work];
        var $183=HEAP[$2];
        var $184=($183)&4294967295;
        var $185=($184+96)&4294967295;
        var $186=HEAP[$185];
        FUNCTION_TABLE[$180]($181, $182, $186);
        __label__ = 39; break;
      case 39: // $187
        var $188=HEAP[$2];
        _rndr_popbuf($188);
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _isspace($_c) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 4);
    var __label__;
  
    var $1=__stackBase__;
    HEAP[$1]=$_c;
    var $2=HEAP[$1];
    var $3=___istype($2, 16384);
    STACKTOP = __stackBase__;
    return $3;
  }
  

  function ___istype($_c, $_f) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 8);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        HEAP[$1]=$_c;
        HEAP[$2]=$_f;
        var $3=HEAP[$1];
        var $4=_isascii($3);
        var $5=((($4))|0)!=0;
        if ($5) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $6
        var $7=HEAP[$1];
        var $8=((__DefaultRuneLocale+52)&4294967295+$7*4)&4294967295;
        var $9=HEAP[$8];
        var $10=HEAP[$2];
        var $11=($9) & ($10);
        var $12=((($11))|0)!=0;
        var $13=($12) ^ 1;
        var $14=($13) ^ 1;
        var $15=unSign(($14), 1, 0);
        __lastLabel__ = 0; __label__ = 2; break;
      case 1: // $16
        var $17=HEAP[$1];
        var $18=HEAP[$2];
        var $19=___maskrune($17, $18);
        var $20=((($19))|0)!=0;
        var $21=($20) ^ 1;
        var $22=($21) ^ 1;
        var $23=unSign(($22), 1, 0);
        __lastLabel__ = 1; __label__ = 2; break;
      case 2: // $24
        var $25=__lastLabel__ == 0 ? $15 : ($23);
        STACKTOP = __stackBase__;
        return $25;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _isascii($_c) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 4);
    var __label__;
  
    var $1=__stackBase__;
    HEAP[$1]=$_c;
    var $2=HEAP[$1];
    var $3=($2) & -128;
    var $4=((($3))|0)==0;
    var $5=unSign(($4), 1, 0);
    STACKTOP = __stackBase__;
    return $5;
  }
  

  function _is_codefence($data, $size, $syntax) {
    var __stackBase__  = STACKTOP; STACKTOP += 29; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 29);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $i=__stackBase__+16;
        var $n=__stackBase__+20;
        var $c=__stackBase__+24;
        var $syn=__stackBase__+25;
        HEAP[$2]=$data;
        HEAP[$3]=$size;
        HEAP[$4]=$syntax;
        HEAP[$i]=0;
        HEAP[$n]=0;
        var $5=HEAP[$3];
        var $6=unSign(($5), 32, 0) < 3;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1]=0;
        __label__ = 2; break;
      case 1: // $8
        var $9=HEAP[$2];
        var $10=($9)&4294967295;
        var $11=HEAP[$10];
        var $12=reSign(($11), 8, 0);
        var $13=((($12))|0)==32;
        if ($13) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $14
        var $15=HEAP[$i];
        var $16=(($15) + 1)&4294967295;
        HEAP[$i]=$16;
        var $17=HEAP[$2];
        var $18=($17+1)&4294967295;
        var $19=HEAP[$18];
        var $20=reSign(($19), 8, 0);
        var $21=((($20))|0)==32;
        if ($21) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $22
        var $23=HEAP[$i];
        var $24=(($23) + 1)&4294967295;
        HEAP[$i]=$24;
        var $25=HEAP[$2];
        var $26=($25+2)&4294967295;
        var $27=HEAP[$26];
        var $28=reSign(($27), 8, 0);
        var $29=((($28))|0)==32;
        if ($29) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $30
        var $31=HEAP[$i];
        var $32=(($31) + 1)&4294967295;
        HEAP[$i]=$32;
        __label__ = 8; break;
      case 8: // $33
        __label__ = 6; break;
      case 6: // $34
        __label__ = 4; break;
      case 4: // $35
        var $36=HEAP[$i];
        var $37=(($36) + 2)&4294967295;
        var $38=HEAP[$3];
        var $39=unSign(($37), 32, 0) >= unSign(($38), 32, 0);
        if ($39) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 10: // $40
        var $41=HEAP[$i];
        var $42=HEAP[$2];
        var $43=($42+$41)&4294967295;
        var $44=HEAP[$43];
        var $45=reSign(($44), 8, 0);
        var $46=((($45))|0)==126;
        if ($46) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 12: // $47
        var $48=HEAP[$i];
        var $49=HEAP[$2];
        var $50=($49+$48)&4294967295;
        var $51=HEAP[$50];
        var $52=reSign(($51), 8, 0);
        var $53=((($52))|0)==96;
        if ($53) { __label__ = 11; break; } else { __label__ = 9; break; }
      case 9: // $54
        HEAP[$1]=0;
        __label__ = 2; break;
      case 11: // $55
        var $56=HEAP[$i];
        var $57=HEAP[$2];
        var $58=($57+$56)&4294967295;
        var $59=HEAP[$58];
        HEAP[$c]=$59;
        __label__ = 13; break;
      case 13: // $60
        var $61=HEAP[$i];
        var $62=HEAP[$3];
        var $63=unSign(($61), 32, 0) < unSign(($62), 32, 0);
        if ($63) { __lastLabel__ = 13; __label__ = 14; break; } else { __lastLabel__ = 13; __label__ = 15; break; }
      case 14: // $64
        var $65=HEAP[$i];
        var $66=HEAP[$2];
        var $67=($66+$65)&4294967295;
        var $68=HEAP[$67];
        var $69=reSign(($68), 8, 0);
        var $70=HEAP[$c];
        var $71=reSign(($70), 8, 0);
        var $72=((($69))|0)==((($71))|0);
        __lastLabel__ = 14; __label__ = 15; break;
      case 15: // $73
        var $74=__lastLabel__ == 13 ? 0 : ($72);
        if ($74) { __label__ = 16; break; } else { __label__ = 17; break; }
      case 16: // $75
        var $76=HEAP[$n];
        var $77=(($76) + 1)&4294967295;
        HEAP[$n]=$77;
        var $78=HEAP[$i];
        var $79=(($78) + 1)&4294967295;
        HEAP[$i]=$79;
        __label__ = 13; break;
      case 17: // $80
        var $81=HEAP[$n];
        var $82=unSign(($81), 32, 0) < 3;
        if ($82) { __label__ = 18; break; } else { __label__ = 19; break; }
      case 18: // $83
        HEAP[$1]=0;
        __label__ = 2; break;
      case 19: // $84
        var $85=HEAP[$4];
        var $86=($85)!=0;
        if ($86) { __label__ = 20; break; } else { __label__ = 21; break; }
      case 20: // $87
        HEAP[$syn]=0;
        __label__ = 22; break;
      case 22: // $88
        var $89=HEAP[$i];
        var $90=HEAP[$3];
        var $91=unSign(($89), 32, 0) < unSign(($90), 32, 0);
        if ($91) { __lastLabel__ = 22; __label__ = 23; break; } else { __lastLabel__ = 22; __label__ = 24; break; }
      case 23: // $92
        var $93=HEAP[$i];
        var $94=HEAP[$2];
        var $95=($94+$93)&4294967295;
        var $96=HEAP[$95];
        var $97=reSign(($96), 8, 0);
        var $98=((($97))|0)==32;
        if ($98) { __lastLabel__ = 23; __label__ = 25; break; } else { __lastLabel__ = 23; __label__ = 26; break; }
      case 26: // $99
        var $100=HEAP[$i];
        var $101=HEAP[$2];
        var $102=($101+$100)&4294967295;
        var $103=HEAP[$102];
        var $104=reSign(($103), 8, 0);
        var $105=((($104))|0)==9;
        __lastLabel__ = 26; __label__ = 25; break;
      case 25: // $106
        var $107=__lastLabel__ == 23 ? 1 : ($105);
        __lastLabel__ = 25; __label__ = 24; break;
      case 24: // $108
        var $109=__lastLabel__ == 22 ? 0 : ($107);
        if ($109) { __label__ = 27; break; } else { __label__ = 28; break; }
      case 27: // $110
        var $111=HEAP[$i];
        var $112=(($111) + 1)&4294967295;
        HEAP[$i]=$112;
        __label__ = 22; break;
      case 28: // $113
        var $114=HEAP[$2];
        var $115=HEAP[$i];
        var $116=($114+$115)&4294967295;
        var $117=HEAP[$4];
        var $118=($117)&4294967295;
        HEAP[$118]=$116;
        __label__ = 29; break;
      case 29: // $119
        var $120=HEAP[$i];
        var $121=HEAP[$3];
        var $122=unSign(($120), 32, 0) < unSign(($121), 32, 0);
        if ($122) { __lastLabel__ = 29; __label__ = 30; break; } else { __lastLabel__ = 29; __label__ = 31; break; }
      case 30: // $123
        var $124=HEAP[$i];
        var $125=HEAP[$2];
        var $126=($125+$124)&4294967295;
        var $127=HEAP[$126];
        var $128=reSign(($127), 8, 0);
        var $129=_isspace($128);
        var $130=((($129))|0)!=0;
        var $131=($130) ^ 1;
        __lastLabel__ = 30; __label__ = 31; break;
      case 31: // $132
        var $133=__lastLabel__ == 29 ? 0 : ($131);
        if ($133) { __label__ = 32; break; } else { __label__ = 33; break; }
      case 32: // $134
        var $135=HEAP[$syn];
        var $136=(($135) + 1)&4294967295;
        HEAP[$syn]=$136;
        var $137=HEAP[$i];
        var $138=(($137) + 1)&4294967295;
        HEAP[$i]=$138;
        __label__ = 29; break;
      case 33: // $139
        var $140=HEAP[$syn];
        var $141=HEAP[$4];
        var $142=($141+4)&4294967295;
        HEAP[$142]=$140;
        __label__ = 21; break;
      case 21: // $143
        __label__ = 34; break;
      case 34: // $144
        var $145=HEAP[$i];
        var $146=HEAP[$3];
        var $147=unSign(($145), 32, 0) < unSign(($146), 32, 0);
        if ($147) { __lastLabel__ = 34; __label__ = 35; break; } else { __lastLabel__ = 34; __label__ = 36; break; }
      case 35: // $148
        var $149=HEAP[$i];
        var $150=HEAP[$2];
        var $151=($150+$149)&4294967295;
        var $152=HEAP[$151];
        var $153=reSign(($152), 8, 0);
        var $154=((($153))|0)!=10;
        __lastLabel__ = 35; __label__ = 36; break;
      case 36: // $155
        var $156=__lastLabel__ == 34 ? 0 : ($154);
        if ($156) { __label__ = 37; break; } else { __label__ = 38; break; }
      case 37: // $157
        var $158=HEAP[$i];
        var $159=HEAP[$2];
        var $160=($159+$158)&4294967295;
        var $161=HEAP[$160];
        var $162=reSign(($161), 8, 0);
        var $163=_isspace($162);
        var $164=((($163))|0)!=0;
        if ($164) { __label__ = 39; break; } else { __label__ = 40; break; }
      case 40: // $165
        HEAP[$1]=0;
        __label__ = 2; break;
      case 39: // $166
        var $167=HEAP[$i];
        var $168=(($167) + 1)&4294967295;
        HEAP[$i]=$168;
        __label__ = 34; break;
      case 38: // $169
        var $170=HEAP[$i];
        var $171=(($170) + 1)&4294967295;
        HEAP[$1]=$171;
        __label__ = 2; break;
      case 2: // $172
        var $173=HEAP[$1];
        STACKTOP = __stackBase__;
        return $173;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _find_block_tag($data, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 24);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $i=__stackBase__+12;
        var $key=__stackBase__+16;
        HEAP[$2]=$data;
        HEAP[$3]=$size;
        HEAP[$i]=0;
        __label__ = 0; break;
      case 0: // $4
        var $5=HEAP[$i];
        var $6=HEAP[$3];
        var $7=unSign(($5), 32, 0) < unSign(($6), 32, 0);
        if ($7) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 1: // $8
        var $9=HEAP[$i];
        var $10=HEAP[$2];
        var $11=($10+$9)&4294967295;
        var $12=HEAP[$11];
        var $13=reSign(($12), 8, 0);
        var $14=((($13))|0) >= 48;
        if ($14) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $15
        var $16=HEAP[$i];
        var $17=HEAP[$2];
        var $18=($17+$16)&4294967295;
        var $19=HEAP[$18];
        var $20=reSign(($19), 8, 0);
        var $21=((($20))|0) <= 57;
        if ($21) { __lastLabel__ = 3; __label__ = 5; break; } else { __lastLabel__ = 3; __label__ = 4; break; }
      case 4: // $22
        var $23=HEAP[$i];
        var $24=HEAP[$2];
        var $25=($24+$23)&4294967295;
        var $26=HEAP[$25];
        var $27=reSign(($26), 8, 0);
        var $28=((($27))|0) >= 65;
        if ($28) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $29
        var $30=HEAP[$i];
        var $31=HEAP[$2];
        var $32=($31+$30)&4294967295;
        var $33=HEAP[$32];
        var $34=reSign(($33), 8, 0);
        var $35=((($34))|0) <= 90;
        if ($35) { __lastLabel__ = 6; __label__ = 5; break; } else { __lastLabel__ = 6; __label__ = 7; break; }
      case 7: // $36
        var $37=HEAP[$i];
        var $38=HEAP[$2];
        var $39=($38+$37)&4294967295;
        var $40=HEAP[$39];
        var $41=reSign(($40), 8, 0);
        var $42=((($41))|0) >= 97;
        if ($42) { __lastLabel__ = 7; __label__ = 8; break; } else { __lastLabel__ = 7; __label__ = 9; break; }
      case 8: // $43
        var $44=HEAP[$i];
        var $45=HEAP[$2];
        var $46=($45+$44)&4294967295;
        var $47=HEAP[$46];
        var $48=reSign(($47), 8, 0);
        var $49=((($48))|0) <= 122;
        __lastLabel__ = 8; __label__ = 9; break;
      case 9: // $50
        var $51=__lastLabel__ == 7 ? 0 : ($49);
        __lastLabel__ = 9; __label__ = 5; break;
      case 5: // $52
        var $53=__lastLabel__ == 6 ? 1 : (__lastLabel__ == 3 ? 1 : ($51));
        __lastLabel__ = 5; __label__ = 2; break;
      case 2: // $54
        var $55=__lastLabel__ == 0 ? 0 : ($53);
        if ($55) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $56
        var $57=HEAP[$i];
        var $58=(($57) + 1)&4294967295;
        HEAP[$i]=$58;
        __label__ = 0; break;
      case 11: // $59
        var $60=HEAP[$i];
        var $61=HEAP[$3];
        var $62=unSign(($60), 32, 0) >= unSign(($61), 32, 0);
        if ($62) { __label__ = 12; break; } else { __label__ = 13; break; }
      case 12: // $63
        HEAP[$1]=0;
        __label__ = 14; break;
      case 13: // $64
        var $65=HEAP[$2];
        var $66=($key)&4294967295;
        HEAP[$66]=$65;
        var $67=HEAP[$i];
        var $68=($key+4)&4294967295;
        HEAP[$68]=$67;
        var $69=$key;
        var $70=_bsearch($69, _block_tags, 22, 8, 22);
        var $71=$70;
        HEAP[$1]=$71;
        __label__ = 14; break;
      case 14: // $72
        var $73=HEAP[$1];
        STACKTOP = __stackBase__;
        return $73;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _htmlblock_end($tag, $rndr, $data, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 28; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 28);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $i=__stackBase__+20;
        var $w=__stackBase__+24;
        HEAP[$2]=$tag;
        HEAP[$3]=$rndr;
        HEAP[$4]=$data;
        HEAP[$5]=$size;
        var $6=HEAP[$2];
        var $7=($6+4)&4294967295;
        var $8=HEAP[$7];
        var $9=(($8) + 3)&4294967295;
        var $10=HEAP[$5];
        var $11=unSign(($9), 32, 0) >= unSign(($10), 32, 0);
        if ($11) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $12
        var $13=HEAP[$4];
        var $14=($13+2)&4294967295;
        var $15=HEAP[$2];
        var $16=($15)&4294967295;
        var $17=HEAP[$16];
        var $18=HEAP[$2];
        var $19=($18+4)&4294967295;
        var $20=HEAP[$19];
        var $21=_strncasecmp($14, $17, $20);
        var $22=((($21))|0)!=0;
        if ($22) { __label__ = 0; break; } else { __label__ = 2; break; }
      case 2: // $23
        var $24=HEAP[$2];
        var $25=($24+4)&4294967295;
        var $26=HEAP[$25];
        var $27=(($26) + 2)&4294967295;
        var $28=HEAP[$4];
        var $29=($28+$27)&4294967295;
        var $30=HEAP[$29];
        var $31=reSign(($30), 8, 0);
        var $32=((($31))|0)!=62;
        if ($32) { __label__ = 0; break; } else { __label__ = 3; break; }
      case 0: // $33
        HEAP[$1]=0;
        __label__ = 4; break;
      case 3: // $34
        var $35=HEAP[$2];
        var $36=($35+4)&4294967295;
        var $37=HEAP[$36];
        var $38=(($37) + 3)&4294967295;
        HEAP[$i]=$38;
        HEAP[$w]=0;
        var $39=HEAP[$i];
        var $40=HEAP[$5];
        var $41=unSign(($39), 32, 0) < unSign(($40), 32, 0);
        if ($41) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $42
        var $43=HEAP[$4];
        var $44=HEAP[$i];
        var $45=($43+$44)&4294967295;
        var $46=HEAP[$5];
        var $47=HEAP[$i];
        var $48=(($46) - ($47))&4294967295;
        var $49=_is_empty($45, $48);
        HEAP[$w]=$49;
        var $50=((($49))|0)==0;
        if ($50) { __label__ = 7; break; } else { __label__ = 6; break; }
      case 7: // $51
        HEAP[$1]=0;
        __label__ = 4; break;
      case 6: // $52
        var $53=HEAP[$w];
        var $54=HEAP[$i];
        var $55=(($54) + ($53))&4294967295;
        HEAP[$i]=$55;
        HEAP[$w]=0;
        var $56=HEAP[$3];
        var $57=($56+1152)&4294967295;
        var $58=HEAP[$57];
        var $59=($58) & 32;
        var $60=((($59))|0)!=0;
        if ($60) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $61
        var $62=HEAP[$i];
        var $63=HEAP[$5];
        var $64=unSign(($62), 32, 0) < unSign(($63), 32, 0);
        if ($64) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $65
        var $66=HEAP[$4];
        var $67=HEAP[$i];
        var $68=($66+$67)&4294967295;
        var $69=HEAP[$5];
        var $70=HEAP[$i];
        var $71=(($69) - ($70))&4294967295;
        var $72=_is_empty($68, $71);
        HEAP[$w]=$72;
        __label__ = 11; break;
      case 11: // $73
        __label__ = 12; break;
      case 9: // $74
        var $75=HEAP[$i];
        var $76=HEAP[$5];
        var $77=unSign(($75), 32, 0) < unSign(($76), 32, 0);
        if ($77) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $78
        var $79=HEAP[$4];
        var $80=HEAP[$i];
        var $81=($79+$80)&4294967295;
        var $82=HEAP[$5];
        var $83=HEAP[$i];
        var $84=(($82) - ($83))&4294967295;
        var $85=_is_empty($81, $84);
        HEAP[$w]=$85;
        var $86=((($85))|0)==0;
        if ($86) { __label__ = 15; break; } else { __label__ = 14; break; }
      case 15: // $87
        HEAP[$1]=0;
        __label__ = 4; break;
      case 14: // $88
        __label__ = 12; break;
      case 12: // $89
        var $90=HEAP[$i];
        var $91=HEAP[$w];
        var $92=(($90) + ($91))&4294967295;
        HEAP[$1]=$92;
        __label__ = 4; break;
      case 4: // $93
        var $94=HEAP[$1];
        STACKTOP = __stackBase__;
        return $94;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _cmp_html_tag($a, $b) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 20);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $hta=__stackBase__+12;
        var $htb=__stackBase__+16;
        HEAP[$2]=$a;
        HEAP[$3]=$b;
        var $4=HEAP[$2];
        var $5=$4;
        HEAP[$hta]=$5;
        var $6=HEAP[$3];
        var $7=$6;
        HEAP[$htb]=$7;
        var $8=HEAP[$hta];
        var $9=($8+4)&4294967295;
        var $10=HEAP[$9];
        var $11=HEAP[$htb];
        var $12=($11+4)&4294967295;
        var $13=HEAP[$12];
        var $14=((($10))|0)!=((($13))|0);
        if ($14) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $15
        var $16=HEAP[$hta];
        var $17=($16+4)&4294967295;
        var $18=HEAP[$17];
        var $19=HEAP[$htb];
        var $20=($19+4)&4294967295;
        var $21=HEAP[$20];
        var $22=(($18) - ($21))&4294967295;
        HEAP[$1]=$22;
        __label__ = 2; break;
      case 1: // $23
        var $24=HEAP[$hta];
        var $25=($24)&4294967295;
        var $26=HEAP[$25];
        var $27=HEAP[$htb];
        var $28=($27)&4294967295;
        var $29=HEAP[$28];
        var $30=HEAP[$hta];
        var $31=($30+4)&4294967295;
        var $32=HEAP[$31];
        var $33=_strncasecmp($26, $29, $32);
        HEAP[$1]=$33;
        __label__ = 2; break;
      case 2: // $34
        var $35=HEAP[$1];
        STACKTOP = __stackBase__;
        return $35;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _isalnum($_c) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 4);
    var __label__;
  
    var $1=__stackBase__;
    HEAP[$1]=$_c;
    var $2=HEAP[$1];
    var $3=___istype($2, 1280);
    STACKTOP = __stackBase__;
    return $3;
  }
  

  function _tag_length($data, $size, $autolink) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 24);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $i=__stackBase__+16;
        var $j=__stackBase__+20;
        HEAP[$2]=$data;
        HEAP[$3]=$size;
        HEAP[$4]=$autolink;
        var $5=HEAP[$3];
        var $6=unSign(($5), 32, 0) < 3;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1]=0;
        __label__ = 2; break;
      case 1: // $8
        var $9=HEAP[$2];
        var $10=($9)&4294967295;
        var $11=HEAP[$10];
        var $12=reSign(($11), 8, 0);
        var $13=((($12))|0)!=60;
        if ($13) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $14
        HEAP[$1]=0;
        __label__ = 2; break;
      case 4: // $15
        var $16=HEAP[$2];
        var $17=($16+1)&4294967295;
        var $18=HEAP[$17];
        var $19=reSign(($18), 8, 0);
        var $20=((($19))|0)==47;
        var $21=($20) ? 2 : 1;
        HEAP[$i]=$21;
        var $22=HEAP[$i];
        var $23=HEAP[$2];
        var $24=($23+$22)&4294967295;
        var $25=HEAP[$24];
        var $26=reSign(($25), 8, 0);
        var $27=((($26))|0) < 97;
        if ($27) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 6: // $28
        var $29=HEAP[$i];
        var $30=HEAP[$2];
        var $31=($30+$29)&4294967295;
        var $32=HEAP[$31];
        var $33=reSign(($32), 8, 0);
        var $34=((($33))|0) > 122;
        if ($34) { __label__ = 5; break; } else { __label__ = 7; break; }
      case 5: // $35
        var $36=HEAP[$i];
        var $37=HEAP[$2];
        var $38=($37+$36)&4294967295;
        var $39=HEAP[$38];
        var $40=reSign(($39), 8, 0);
        var $41=((($40))|0) < 65;
        if ($41) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 9: // $42
        var $43=HEAP[$i];
        var $44=HEAP[$2];
        var $45=($44+$43)&4294967295;
        var $46=HEAP[$45];
        var $47=reSign(($46), 8, 0);
        var $48=((($47))|0) > 90;
        if ($48) { __label__ = 8; break; } else { __label__ = 7; break; }
      case 8: // $49
        HEAP[$1]=0;
        __label__ = 2; break;
      case 7: // $50
        var $51=HEAP[$4];
        HEAP[$51]=0;
        __label__ = 10; break;
      case 10: // $52
        var $53=HEAP[$i];
        var $54=HEAP[$3];
        var $55=unSign(($53), 32, 0) < unSign(($54), 32, 0);
        if ($55) { __lastLabel__ = 10; __label__ = 11; break; } else { __lastLabel__ = 10; __label__ = 12; break; }
      case 11: // $56
        var $57=HEAP[$i];
        var $58=HEAP[$2];
        var $59=($58+$57)&4294967295;
        var $60=HEAP[$59];
        var $61=reSign(($60), 8, 0);
        var $62=_isalpha($61);
        var $63=((($62))|0)!=0;
        if ($63) { __lastLabel__ = 11; __label__ = 13; break; } else { __lastLabel__ = 11; __label__ = 14; break; }
      case 14: // $64
        var $65=HEAP[$i];
        var $66=HEAP[$2];
        var $67=($66+$65)&4294967295;
        var $68=HEAP[$67];
        var $69=reSign(($68), 8, 0);
        var $70=((($69))|0)==46;
        if ($70) { __lastLabel__ = 14; __label__ = 13; break; } else { __lastLabel__ = 14; __label__ = 15; break; }
      case 15: // $71
        var $72=HEAP[$i];
        var $73=HEAP[$2];
        var $74=($73+$72)&4294967295;
        var $75=HEAP[$74];
        var $76=reSign(($75), 8, 0);
        var $77=((($76))|0)==43;
        if ($77) { __lastLabel__ = 15; __label__ = 13; break; } else { __lastLabel__ = 15; __label__ = 16; break; }
      case 16: // $78
        var $79=HEAP[$i];
        var $80=HEAP[$2];
        var $81=($80+$79)&4294967295;
        var $82=HEAP[$81];
        var $83=reSign(($82), 8, 0);
        var $84=((($83))|0)==45;
        __lastLabel__ = 16; __label__ = 13; break;
      case 13: // $85
        var $86=__lastLabel__ == 15 ? 1 : (__lastLabel__ == 14 ? 1 : (__lastLabel__ == 11 ? 1 : ($84)));
        __lastLabel__ = 13; __label__ = 12; break;
      case 12: // $87
        var $88=__lastLabel__ == 10 ? 0 : ($86);
        if ($88) { __label__ = 17; break; } else { __label__ = 18; break; }
      case 17: // $89
        var $90=HEAP[$i];
        var $91=(($90) + 1)&4294967295;
        HEAP[$i]=$91;
        __label__ = 10; break;
      case 18: // $92
        var $93=HEAP[$i];
        var $94=unSign(($93), 32, 0) > 2;
        if ($94) { __label__ = 19; break; } else { __label__ = 20; break; }
      case 19: // $95
        var $96=HEAP[$i];
        var $97=HEAP[$2];
        var $98=($97+$96)&4294967295;
        var $99=HEAP[$98];
        var $100=reSign(($99), 8, 0);
        var $101=((($100))|0)==58;
        if ($101) { __label__ = 21; break; } else { __label__ = 20; break; }
      case 21: // $102
        var $103=HEAP[$4];
        HEAP[$103]=1;
        var $104=HEAP[$i];
        var $105=(($104) + 1)&4294967295;
        HEAP[$i]=$105;
        __label__ = 20; break;
      case 20: // $106
        var $107=HEAP[$i];
        var $108=HEAP[$3];
        var $109=unSign(($107), 32, 0) >= unSign(($108), 32, 0);
        if ($109) { __label__ = 22; break; } else { __label__ = 23; break; }
      case 23: // $110
        var $111=HEAP[$i];
        var $112=((($111))|0)==62;
        if ($112) { __label__ = 22; break; } else { __label__ = 24; break; }
      case 22: // $113
        var $114=HEAP[$4];
        HEAP[$114]=0;
        __label__ = 25; break;
      case 24: // $115
        var $116=HEAP[$4];
        var $117=HEAP[$116];
        var $118=((($117))|0)!=0;
        if ($118) { __label__ = 26; break; } else { __label__ = 27; break; }
      case 26: // $119
        var $120=HEAP[$i];
        HEAP[$j]=$120;
        __label__ = 28; break;
      case 28: // $121
        var $122=HEAP[$i];
        var $123=HEAP[$3];
        var $124=unSign(($122), 32, 0) < unSign(($123), 32, 0);
        if ($124) { __lastLabel__ = 28; __label__ = 29; break; } else { __lastLabel__ = 28; __label__ = 30; break; }
      case 29: // $125
        var $126=HEAP[$i];
        var $127=HEAP[$2];
        var $128=($127+$126)&4294967295;
        var $129=HEAP[$128];
        var $130=reSign(($129), 8, 0);
        var $131=((($130))|0)!=62;
        if ($131) { __lastLabel__ = 29; __label__ = 31; break; } else { __lastLabel__ = 29; __label__ = 30; break; }
      case 31: // $132
        var $133=HEAP[$i];
        var $134=HEAP[$2];
        var $135=($134+$133)&4294967295;
        var $136=HEAP[$135];
        var $137=reSign(($136), 8, 0);
        var $138=((($137))|0)!=39;
        if ($138) { __lastLabel__ = 31; __label__ = 32; break; } else { __lastLabel__ = 31; __label__ = 30; break; }
      case 32: // $139
        var $140=HEAP[$i];
        var $141=HEAP[$2];
        var $142=($141+$140)&4294967295;
        var $143=HEAP[$142];
        var $144=reSign(($143), 8, 0);
        var $145=((($144))|0)!=34;
        if ($145) { __lastLabel__ = 32; __label__ = 33; break; } else { __lastLabel__ = 32; __label__ = 30; break; }
      case 33: // $146
        var $147=HEAP[$i];
        var $148=HEAP[$2];
        var $149=($148+$147)&4294967295;
        var $150=HEAP[$149];
        var $151=reSign(($150), 8, 0);
        var $152=((($151))|0)!=32;
        if ($152) { __lastLabel__ = 33; __label__ = 34; break; } else { __lastLabel__ = 33; __label__ = 30; break; }
      case 34: // $153
        var $154=HEAP[$i];
        var $155=HEAP[$2];
        var $156=($155+$154)&4294967295;
        var $157=HEAP[$156];
        var $158=reSign(($157), 8, 0);
        var $159=((($158))|0)!=9;
        if ($159) { __lastLabel__ = 34; __label__ = 35; break; } else { __lastLabel__ = 34; __label__ = 30; break; }
      case 35: // $160
        var $161=HEAP[$i];
        var $162=HEAP[$2];
        var $163=($162+$161)&4294967295;
        var $164=HEAP[$163];
        var $165=reSign(($164), 8, 0);
        var $166=((($165))|0)!=9;
        __lastLabel__ = 35; __label__ = 30; break;
      case 30: // $167
        var $168=__lastLabel__ == 34 ? 0 : (__lastLabel__ == 33 ? 0 : (__lastLabel__ == 32 ? 0 : (__lastLabel__ == 31 ? 0 : (__lastLabel__ == 29 ? 0 : (__lastLabel__ == 28 ? 0 : ($166))))));
        if ($168) { __label__ = 36; break; } else { __label__ = 37; break; }
      case 36: // $169
        var $170=HEAP[$i];
        var $171=(($170) + 1)&4294967295;
        HEAP[$i]=$171;
        __label__ = 28; break;
      case 37: // $172
        var $173=HEAP[$i];
        var $174=HEAP[$3];
        var $175=unSign(($173), 32, 0) >= unSign(($174), 32, 0);
        if ($175) { __label__ = 38; break; } else { __label__ = 39; break; }
      case 38: // $176
        HEAP[$1]=0;
        __label__ = 2; break;
      case 39: // $177
        var $178=HEAP[$i];
        var $179=HEAP[$j];
        var $180=unSign(($178), 32, 0) > unSign(($179), 32, 0);
        if ($180) { __label__ = 40; break; } else { __label__ = 41; break; }
      case 40: // $181
        var $182=HEAP[$i];
        var $183=HEAP[$2];
        var $184=($183+$182)&4294967295;
        var $185=HEAP[$184];
        var $186=reSign(($185), 8, 0);
        var $187=((($186))|0)==62;
        if ($187) { __label__ = 42; break; } else { __label__ = 41; break; }
      case 42: // $188
        var $189=HEAP[$i];
        var $190=(($189) + 1)&4294967295;
        HEAP[$1]=$190;
        __label__ = 2; break;
      case 41: // $191
        var $192=HEAP[$4];
        HEAP[$192]=0;
        __label__ = 43; break;
      case 27: // $193
        var $194=HEAP[$2];
        var $195=HEAP[$i];
        var $196=($194+$195)&4294967295;
        var $197=HEAP[$3];
        var $198=HEAP[$i];
        var $199=(($197) - ($198))&4294967295;
        var $200=_is_mail_autolink($196, $199);
        HEAP[$j]=$200;
        var $201=((($200))|0)!=0;
        if ($201) { __label__ = 44; break; } else { __label__ = 45; break; }
      case 44: // $202
        var $203=HEAP[$i];
        var $204=((($203))|0)==8;
        if ($204) { __label__ = 46; break; } else { __label__ = 47; break; }
      case 46: // $205
        __lastLabel__ = 46; __label__ = 48; break;
      case 47: // $206
        __lastLabel__ = 47; __label__ = 48; break;
      case 48: // $207
        var $208=__lastLabel__ == 46 ? 2 : (3);
        var $209=HEAP[$4];
        HEAP[$209]=$208;
        var $210=HEAP[$i];
        var $211=HEAP[$j];
        var $212=(($210) + ($211))&4294967295;
        HEAP[$1]=$212;
        __label__ = 2; break;
      case 45: // $213
        __label__ = 43; break;
      case 43: // $214
        __label__ = 25; break;
      case 25: // $215
        __label__ = 49; break;
      case 49: // $216
        var $217=HEAP[$i];
        var $218=HEAP[$3];
        var $219=unSign(($217), 32, 0) < unSign(($218), 32, 0);
        if ($219) { __lastLabel__ = 49; __label__ = 50; break; } else { __lastLabel__ = 49; __label__ = 51; break; }
      case 50: // $220
        var $221=HEAP[$i];
        var $222=HEAP[$2];
        var $223=($222+$221)&4294967295;
        var $224=HEAP[$223];
        var $225=reSign(($224), 8, 0);
        var $226=((($225))|0)!=62;
        __lastLabel__ = 50; __label__ = 51; break;
      case 51: // $227
        var $228=__lastLabel__ == 49 ? 0 : ($226);
        if ($228) { __label__ = 52; break; } else { __label__ = 53; break; }
      case 52: // $229
        var $230=HEAP[$i];
        var $231=(($230) + 1)&4294967295;
        HEAP[$i]=$231;
        __label__ = 49; break;
      case 53: // $232
        var $233=HEAP[$i];
        var $234=HEAP[$3];
        var $235=unSign(($233), 32, 0) >= unSign(($234), 32, 0);
        if ($235) { __label__ = 54; break; } else { __label__ = 55; break; }
      case 54: // $236
        HEAP[$1]=0;
        __label__ = 2; break;
      case 55: // $237
        var $238=HEAP[$i];
        var $239=(($238) + 1)&4294967295;
        HEAP[$1]=$239;
        __label__ = 2; break;
      case 2: // $240
        var $241=HEAP[$1];
        STACKTOP = __stackBase__;
        return $241;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _isalpha($_c) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 4);
    var __label__;
  
    var $1=__stackBase__;
    HEAP[$1]=$_c;
    var $2=HEAP[$1];
    var $3=___istype($2, 256);
    STACKTOP = __stackBase__;
    return $3;
  }
  

  function _is_mail_autolink($data, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 20);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $i=__stackBase__+12;
        var $nb=__stackBase__+16;
        HEAP[$2]=$data;
        HEAP[$3]=$size;
        HEAP[$i]=0;
        HEAP[$nb]=0;
        __label__ = 0; break;
      case 0: // $4
        var $5=HEAP[$i];
        var $6=HEAP[$3];
        var $7=unSign(($5), 32, 0) < unSign(($6), 32, 0);
        if ($7) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 1: // $8
        var $9=HEAP[$i];
        var $10=HEAP[$2];
        var $11=($10+$9)&4294967295;
        var $12=HEAP[$11];
        var $13=reSign(($12), 8, 0);
        var $14=((($13))|0)==45;
        if ($14) { __lastLabel__ = 1; __label__ = 3; break; } else { __lastLabel__ = 1; __label__ = 4; break; }
      case 4: // $15
        var $16=HEAP[$i];
        var $17=HEAP[$2];
        var $18=($17+$16)&4294967295;
        var $19=HEAP[$18];
        var $20=reSign(($19), 8, 0);
        var $21=((($20))|0)==46;
        if ($21) { __lastLabel__ = 4; __label__ = 3; break; } else { __lastLabel__ = 4; __label__ = 5; break; }
      case 5: // $22
        var $23=HEAP[$i];
        var $24=HEAP[$2];
        var $25=($24+$23)&4294967295;
        var $26=HEAP[$25];
        var $27=reSign(($26), 8, 0);
        var $28=((($27))|0)==95;
        if ($28) { __lastLabel__ = 5; __label__ = 3; break; } else { __lastLabel__ = 5; __label__ = 6; break; }
      case 6: // $29
        var $30=HEAP[$i];
        var $31=HEAP[$2];
        var $32=($31+$30)&4294967295;
        var $33=HEAP[$32];
        var $34=reSign(($33), 8, 0);
        var $35=((($34))|0)==64;
        if ($35) { __lastLabel__ = 6; __label__ = 3; break; } else { __lastLabel__ = 6; __label__ = 7; break; }
      case 7: // $36
        var $37=HEAP[$i];
        var $38=HEAP[$2];
        var $39=($38+$37)&4294967295;
        var $40=HEAP[$39];
        var $41=reSign(($40), 8, 0);
        var $42=((($41))|0) >= 97;
        if ($42) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $43
        var $44=HEAP[$i];
        var $45=HEAP[$2];
        var $46=($45+$44)&4294967295;
        var $47=HEAP[$46];
        var $48=reSign(($47), 8, 0);
        var $49=((($48))|0) <= 122;
        if ($49) { __lastLabel__ = 8; __label__ = 3; break; } else { __lastLabel__ = 8; __label__ = 9; break; }
      case 9: // $50
        var $51=HEAP[$i];
        var $52=HEAP[$2];
        var $53=($52+$51)&4294967295;
        var $54=HEAP[$53];
        var $55=reSign(($54), 8, 0);
        var $56=((($55))|0) >= 65;
        if ($56) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $57
        var $58=HEAP[$i];
        var $59=HEAP[$2];
        var $60=($59+$58)&4294967295;
        var $61=HEAP[$60];
        var $62=reSign(($61), 8, 0);
        var $63=((($62))|0) <= 90;
        if ($63) { __lastLabel__ = 10; __label__ = 3; break; } else { __lastLabel__ = 10; __label__ = 11; break; }
      case 11: // $64
        var $65=HEAP[$i];
        var $66=HEAP[$2];
        var $67=($66+$65)&4294967295;
        var $68=HEAP[$67];
        var $69=reSign(($68), 8, 0);
        var $70=((($69))|0) >= 48;
        if ($70) { __lastLabel__ = 11; __label__ = 12; break; } else { __lastLabel__ = 11; __label__ = 13; break; }
      case 12: // $71
        var $72=HEAP[$i];
        var $73=HEAP[$2];
        var $74=($73+$72)&4294967295;
        var $75=HEAP[$74];
        var $76=reSign(($75), 8, 0);
        var $77=((($76))|0) <= 57;
        __lastLabel__ = 12; __label__ = 13; break;
      case 13: // $78
        var $79=__lastLabel__ == 11 ? 0 : ($77);
        __lastLabel__ = 13; __label__ = 3; break;
      case 3: // $80
        var $81=__lastLabel__ == 10 ? 1 : (__lastLabel__ == 8 ? 1 : (__lastLabel__ == 6 ? 1 : (__lastLabel__ == 5 ? 1 : (__lastLabel__ == 4 ? 1 : (__lastLabel__ == 1 ? 1 : ($79))))));
        __lastLabel__ = 3; __label__ = 2; break;
      case 2: // $82
        var $83=__lastLabel__ == 0 ? 0 : ($81);
        if ($83) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 14: // $84
        var $85=HEAP[$i];
        var $86=HEAP[$2];
        var $87=($86+$85)&4294967295;
        var $88=HEAP[$87];
        var $89=reSign(($88), 8, 0);
        var $90=((($89))|0)==64;
        if ($90) { __label__ = 16; break; } else { __label__ = 17; break; }
      case 16: // $91
        var $92=HEAP[$nb];
        var $93=(($92) + 1)&4294967295;
        HEAP[$nb]=$93;
        __label__ = 17; break;
      case 17: // $94
        var $95=HEAP[$i];
        var $96=(($95) + 1)&4294967295;
        HEAP[$i]=$96;
        __label__ = 0; break;
      case 15: // $97
        var $98=HEAP[$i];
        var $99=HEAP[$3];
        var $100=unSign(($98), 32, 0) >= unSign(($99), 32, 0);
        if ($100) { __label__ = 18; break; } else { __label__ = 19; break; }
      case 19: // $101
        var $102=HEAP[$i];
        var $103=HEAP[$2];
        var $104=($103+$102)&4294967295;
        var $105=HEAP[$104];
        var $106=reSign(($105), 8, 0);
        var $107=((($106))|0)!=62;
        if ($107) { __label__ = 18; break; } else { __label__ = 20; break; }
      case 20: // $108
        var $109=HEAP[$nb];
        var $110=((($109))|0)!=1;
        if ($110) { __label__ = 18; break; } else { __label__ = 21; break; }
      case 18: // $111
        HEAP[$1]=0;
        __label__ = 22; break;
      case 21: // $112
        var $113=HEAP[$i];
        var $114=(($113) + 1)&4294967295;
        HEAP[$1]=$114;
        __label__ = 22; break;
      case 22: // $115
        var $116=HEAP[$1];
        STACKTOP = __stackBase__;
        return $116;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _cmp_link_ref($key, $array_entry) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 12);
    var __label__;
  
    var $1=__stackBase__;
    var $2=__stackBase__+4;
    var $lr=__stackBase__+8;
    HEAP[$1]=$key;
    HEAP[$2]=$array_entry;
    var $3=HEAP[$2];
    var $4=$3;
    HEAP[$lr]=$4;
    var $5=HEAP[$1];
    var $6=$5;
    var $7=HEAP[$lr];
    var $8=($7)&4294967295;
    var $9=HEAP[$8];
    var $10=_bufcasecmp($6, $9);
    STACKTOP = __stackBase__;
    return $10;
  }
  

  function _parse_emph1($ob, $rndr, $data, $size, $c) {
    var __stackBase__  = STACKTOP; STACKTOP += 37; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 37);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $6=__stackBase__+20;
        var $i=__stackBase__+21;
        var $len=__stackBase__+25;
        var $work=__stackBase__+29;
        var $r=__stackBase__+33;
        HEAP[$2]=$ob;
        HEAP[$3]=$rndr;
        HEAP[$4]=$data;
        HEAP[$5]=$size;
        HEAP[$6]=$c;
        HEAP[$i]=0;
        HEAP[$work]=0;
        var $7=HEAP[$3];
        var $8=($7)&4294967295;
        var $9=($8+56)&4294967295;
        var $10=HEAP[$9];
        var $11=($10)!=0;
        if ($11) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $12
        HEAP[$1]=0;
        __label__ = 2; break;
      case 0: // $13
        var $14=HEAP[$5];
        var $15=unSign(($14), 32, 0) > 1;
        if ($15) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $16
        var $17=HEAP[$4];
        var $18=($17)&4294967295;
        var $19=HEAP[$18];
        var $20=reSign(($19), 8, 0);
        var $21=HEAP[$6];
        var $22=reSign(($21), 8, 0);
        var $23=((($20))|0)==((($22))|0);
        if ($23) { __label__ = 5; break; } else { __label__ = 4; break; }
      case 5: // $24
        var $25=HEAP[$4];
        var $26=($25+1)&4294967295;
        var $27=HEAP[$26];
        var $28=reSign(($27), 8, 0);
        var $29=HEAP[$6];
        var $30=reSign(($29), 8, 0);
        var $31=((($28))|0)==((($30))|0);
        if ($31) { __label__ = 6; break; } else { __label__ = 4; break; }
      case 6: // $32
        HEAP[$i]=1;
        __label__ = 4; break;
      case 4: // $33
        __label__ = 7; break;
      case 7: // $34
        var $35=HEAP[$i];
        var $36=HEAP[$5];
        var $37=unSign(($35), 32, 0) < unSign(($36), 32, 0);
        if ($37) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $38
        var $39=HEAP[$4];
        var $40=HEAP[$i];
        var $41=($39+$40)&4294967295;
        var $42=HEAP[$5];
        var $43=HEAP[$i];
        var $44=(($42) - ($43))&4294967295;
        var $45=HEAP[$6];
        var $46=_find_emph_char($41, $44, $45);
        HEAP[$len]=$46;
        var $47=HEAP[$len];
        var $48=((($47))|0)!=0;
        if ($48) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 11: // $49
        HEAP[$1]=0;
        __label__ = 2; break;
      case 10: // $50
        var $51=HEAP[$len];
        var $52=HEAP[$i];
        var $53=(($52) + ($51))&4294967295;
        HEAP[$i]=$53;
        var $54=HEAP[$i];
        var $55=HEAP[$5];
        var $56=unSign(($54), 32, 0) >= unSign(($55), 32, 0);
        if ($56) { __label__ = 12; break; } else { __label__ = 13; break; }
      case 12: // $57
        HEAP[$1]=0;
        __label__ = 2; break;
      case 13: // $58
        var $59=HEAP[$i];
        var $60=(($59) + 1)&4294967295;
        var $61=HEAP[$5];
        var $62=unSign(($60), 32, 0) < unSign(($61), 32, 0);
        if ($62) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 14: // $63
        var $64=HEAP[$i];
        var $65=(($64) + 1)&4294967295;
        var $66=HEAP[$4];
        var $67=($66+$65)&4294967295;
        var $68=HEAP[$67];
        var $69=reSign(($68), 8, 0);
        var $70=HEAP[$6];
        var $71=reSign(($70), 8, 0);
        var $72=((($69))|0)==((($71))|0);
        if ($72) { __label__ = 16; break; } else { __label__ = 15; break; }
      case 16: // $73
        var $74=HEAP[$i];
        var $75=(($74) + 1)&4294967295;
        HEAP[$i]=$75;
        __label__ = 7; break;
      case 15: // $76
        var $77=HEAP[$i];
        var $78=HEAP[$4];
        var $79=($78+$77)&4294967295;
        var $80=HEAP[$79];
        var $81=reSign(($80), 8, 0);
        var $82=HEAP[$6];
        var $83=reSign(($82), 8, 0);
        var $84=((($81))|0)==((($83))|0);
        if ($84) { __label__ = 17; break; } else { __label__ = 18; break; }
      case 17: // $85
        var $86=HEAP[$i];
        var $87=(($86) - 1)&4294967295;
        var $88=HEAP[$4];
        var $89=($88+$87)&4294967295;
        var $90=HEAP[$89];
        var $91=reSign(($90), 8, 0);
        var $92=_isspace($91);
        var $93=((($92))|0)!=0;
        if ($93) { __label__ = 18; break; } else { __label__ = 19; break; }
      case 19: // $94
        var $95=HEAP[$3];
        var $96=($95+1152)&4294967295;
        var $97=HEAP[$96];
        var $98=($97) & 1;
        var $99=((($98))|0)==0;
        if ($99) { __label__ = 20; break; } else { __label__ = 21; break; }
      case 20: // $100
        var $101=HEAP[$i];
        var $102=(($101) + 1)&4294967295;
        var $103=HEAP[$5];
        var $104=((($102))|0)==((($103))|0);
        if ($104) { __label__ = 22; break; } else { __label__ = 23; break; }
      case 23: // $105
        var $106=HEAP[$i];
        var $107=(($106) + 1)&4294967295;
        var $108=HEAP[$4];
        var $109=($108+$107)&4294967295;
        var $110=HEAP[$109];
        var $111=reSign(($110), 8, 0);
        var $112=_isspace($111);
        var $113=((($112))|0)!=0;
        if ($113) { __label__ = 22; break; } else { __label__ = 24; break; }
      case 24: // $114
        var $115=HEAP[$i];
        var $116=(($115) + 1)&4294967295;
        var $117=HEAP[$4];
        var $118=($117+$116)&4294967295;
        var $119=HEAP[$118];
        var $120=reSign(($119), 8, 0);
        var $121=_ispunct($120);
        var $122=((($121))|0)!=0;
        if ($122) { __label__ = 22; break; } else { __label__ = 25; break; }
      case 25: // $123
        __label__ = 7; break;
      case 22: // $124
        __label__ = 21; break;
      case 21: // $125
        var $126=HEAP[$3];
        var $127=_rndr_newbuf($126);
        HEAP[$work]=$127;
        var $128=HEAP[$work];
        var $129=HEAP[$3];
        var $130=HEAP[$4];
        var $131=HEAP[$i];
        _parse_inline($128, $129, $130, $131);
        var $132=HEAP[$3];
        var $133=($132)&4294967295;
        var $134=($133+56)&4294967295;
        var $135=HEAP[$134];
        var $136=HEAP[$2];
        var $137=HEAP[$work];
        var $138=HEAP[$6];
        var $139=HEAP[$3];
        var $140=($139)&4294967295;
        var $141=($140+96)&4294967295;
        var $142=HEAP[$141];
        var $143=FUNCTION_TABLE[$135]($136, $137, $138, $142);
        HEAP[$r]=$143;
        var $144=HEAP[$3];
        _rndr_popbuf($144);
        var $145=HEAP[$r];
        var $146=((($145))|0)!=0;
        if ($146) { __label__ = 26; break; } else { __label__ = 27; break; }
      case 26: // $147
        var $148=HEAP[$i];
        var $149=(($148) + 1)&4294967295;
        __lastLabel__ = 26; __label__ = 28; break;
      case 27: // $150
        __lastLabel__ = 27; __label__ = 28; break;
      case 28: // $151
        var $152=__lastLabel__ == 26 ? $149 : (0);
        HEAP[$1]=$152;
        __label__ = 2; break;
      case 18: // $153
        __label__ = 7; break;
      case 9: // $154
        HEAP[$1]=0;
        __label__ = 2; break;
      case 2: // $155
        var $156=HEAP[$1];
        STACKTOP = __stackBase__;
        return $156;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parse_emph2($ob, $rndr, $data, $size, $c) {
    var __stackBase__  = STACKTOP; STACKTOP += 37; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 37);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $6=__stackBase__+20;
        var $i=__stackBase__+21;
        var $len=__stackBase__+25;
        var $work=__stackBase__+29;
        var $r=__stackBase__+33;
        HEAP[$2]=$ob;
        HEAP[$3]=$rndr;
        HEAP[$4]=$data;
        HEAP[$5]=$size;
        HEAP[$6]=$c;
        HEAP[$i]=0;
        HEAP[$work]=0;
        var $7=HEAP[$3];
        var $8=($7)&4294967295;
        var $9=($8+52)&4294967295;
        var $10=HEAP[$9];
        var $11=($10)!=0;
        if ($11) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $12
        HEAP[$1]=0;
        __label__ = 2; break;
      case 0: // $13
        __label__ = 3; break;
      case 3: // $14
        var $15=HEAP[$i];
        var $16=HEAP[$5];
        var $17=unSign(($15), 32, 0) < unSign(($16), 32, 0);
        if ($17) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $18
        var $19=HEAP[$4];
        var $20=HEAP[$i];
        var $21=($19+$20)&4294967295;
        var $22=HEAP[$5];
        var $23=HEAP[$i];
        var $24=(($22) - ($23))&4294967295;
        var $25=HEAP[$6];
        var $26=_find_emph_char($21, $24, $25);
        HEAP[$len]=$26;
        var $27=HEAP[$len];
        var $28=((($27))|0)!=0;
        if ($28) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 7: // $29
        HEAP[$1]=0;
        __label__ = 2; break;
      case 6: // $30
        var $31=HEAP[$len];
        var $32=HEAP[$i];
        var $33=(($32) + ($31))&4294967295;
        HEAP[$i]=$33;
        var $34=HEAP[$i];
        var $35=(($34) + 1)&4294967295;
        var $36=HEAP[$5];
        var $37=unSign(($35), 32, 0) < unSign(($36), 32, 0);
        if ($37) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $38
        var $39=HEAP[$i];
        var $40=HEAP[$4];
        var $41=($40+$39)&4294967295;
        var $42=HEAP[$41];
        var $43=reSign(($42), 8, 0);
        var $44=HEAP[$6];
        var $45=reSign(($44), 8, 0);
        var $46=((($43))|0)==((($45))|0);
        if ($46) { __label__ = 10; break; } else { __label__ = 9; break; }
      case 10: // $47
        var $48=HEAP[$i];
        var $49=(($48) + 1)&4294967295;
        var $50=HEAP[$4];
        var $51=($50+$49)&4294967295;
        var $52=HEAP[$51];
        var $53=reSign(($52), 8, 0);
        var $54=HEAP[$6];
        var $55=reSign(($54), 8, 0);
        var $56=((($53))|0)==((($55))|0);
        if ($56) { __label__ = 11; break; } else { __label__ = 9; break; }
      case 11: // $57
        var $58=HEAP[$i];
        var $59=((($58))|0)!=0;
        if ($59) { __label__ = 12; break; } else { __label__ = 9; break; }
      case 12: // $60
        var $61=HEAP[$i];
        var $62=(($61) - 1)&4294967295;
        var $63=HEAP[$4];
        var $64=($63+$62)&4294967295;
        var $65=HEAP[$64];
        var $66=reSign(($65), 8, 0);
        var $67=_isspace($66);
        var $68=((($67))|0)!=0;
        if ($68) { __label__ = 9; break; } else { __label__ = 13; break; }
      case 13: // $69
        var $70=HEAP[$3];
        var $71=_rndr_newbuf($70);
        HEAP[$work]=$71;
        var $72=HEAP[$work];
        var $73=HEAP[$3];
        var $74=HEAP[$4];
        var $75=HEAP[$i];
        _parse_inline($72, $73, $74, $75);
        var $76=HEAP[$3];
        var $77=($76)&4294967295;
        var $78=($77+52)&4294967295;
        var $79=HEAP[$78];
        var $80=HEAP[$2];
        var $81=HEAP[$work];
        var $82=HEAP[$6];
        var $83=HEAP[$3];
        var $84=($83)&4294967295;
        var $85=($84+96)&4294967295;
        var $86=HEAP[$85];
        var $87=FUNCTION_TABLE[$79]($80, $81, $82, $86);
        HEAP[$r]=$87;
        var $88=HEAP[$3];
        _rndr_popbuf($88);
        var $89=HEAP[$r];
        var $90=((($89))|0)!=0;
        if ($90) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 14: // $91
        var $92=HEAP[$i];
        var $93=(($92) + 2)&4294967295;
        __lastLabel__ = 14; __label__ = 16; break;
      case 15: // $94
        __lastLabel__ = 15; __label__ = 16; break;
      case 16: // $95
        var $96=__lastLabel__ == 14 ? $93 : (0);
        HEAP[$1]=$96;
        __label__ = 2; break;
      case 9: // $97
        var $98=HEAP[$i];
        var $99=(($98) + 1)&4294967295;
        HEAP[$i]=$99;
        __label__ = 3; break;
      case 5: // $100
        HEAP[$1]=0;
        __label__ = 2; break;
      case 2: // $101
        var $102=HEAP[$1];
        STACKTOP = __stackBase__;
        return $102;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parse_emph3($ob, $rndr, $data, $size, $c) {
    var __stackBase__  = STACKTOP; STACKTOP += 37; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 37);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $6=__stackBase__+20;
        var $i=__stackBase__+21;
        var $len=__stackBase__+25;
        var $r=__stackBase__+29;
        var $work=__stackBase__+33;
        HEAP[$2]=$ob;
        HEAP[$3]=$rndr;
        HEAP[$4]=$data;
        HEAP[$5]=$size;
        HEAP[$6]=$c;
        HEAP[$i]=0;
        __label__ = 0; break;
      case 0: // $7
        var $8=HEAP[$i];
        var $9=HEAP[$5];
        var $10=unSign(($8), 32, 0) < unSign(($9), 32, 0);
        if ($10) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $11
        var $12=HEAP[$4];
        var $13=HEAP[$i];
        var $14=($12+$13)&4294967295;
        var $15=HEAP[$5];
        var $16=HEAP[$i];
        var $17=(($15) - ($16))&4294967295;
        var $18=HEAP[$6];
        var $19=_find_emph_char($14, $17, $18);
        HEAP[$len]=$19;
        var $20=HEAP[$len];
        var $21=((($20))|0)!=0;
        if ($21) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 4: // $22
        HEAP[$1]=0;
        __label__ = 5; break;
      case 3: // $23
        var $24=HEAP[$len];
        var $25=HEAP[$i];
        var $26=(($25) + ($24))&4294967295;
        HEAP[$i]=$26;
        var $27=HEAP[$i];
        var $28=HEAP[$4];
        var $29=($28+$27)&4294967295;
        var $30=HEAP[$29];
        var $31=reSign(($30), 8, 0);
        var $32=HEAP[$6];
        var $33=reSign(($32), 8, 0);
        var $34=((($31))|0)!=((($33))|0);
        if ($34) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 7: // $35
        var $36=HEAP[$i];
        var $37=(($36) - 1)&4294967295;
        var $38=HEAP[$4];
        var $39=($38+$37)&4294967295;
        var $40=HEAP[$39];
        var $41=reSign(($40), 8, 0);
        var $42=_isspace($41);
        var $43=((($42))|0)!=0;
        if ($43) { __label__ = 6; break; } else { __label__ = 8; break; }
      case 6: // $44
        __label__ = 0; break;
      case 8: // $45
        var $46=HEAP[$i];
        var $47=(($46) + 2)&4294967295;
        var $48=HEAP[$5];
        var $49=unSign(($47), 32, 0) < unSign(($48), 32, 0);
        if ($49) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $50
        var $51=HEAP[$i];
        var $52=(($51) + 1)&4294967295;
        var $53=HEAP[$4];
        var $54=($53+$52)&4294967295;
        var $55=HEAP[$54];
        var $56=reSign(($55), 8, 0);
        var $57=HEAP[$6];
        var $58=reSign(($57), 8, 0);
        var $59=((($56))|0)==((($58))|0);
        if ($59) { __label__ = 11; break; } else { __label__ = 10; break; }
      case 11: // $60
        var $61=HEAP[$i];
        var $62=(($61) + 2)&4294967295;
        var $63=HEAP[$4];
        var $64=($63+$62)&4294967295;
        var $65=HEAP[$64];
        var $66=reSign(($65), 8, 0);
        var $67=HEAP[$6];
        var $68=reSign(($67), 8, 0);
        var $69=((($66))|0)==((($68))|0);
        if ($69) { __label__ = 12; break; } else { __label__ = 10; break; }
      case 12: // $70
        var $71=HEAP[$3];
        var $72=($71)&4294967295;
        var $73=($72+76)&4294967295;
        var $74=HEAP[$73];
        var $75=($74)!=0;
        if ($75) { __label__ = 13; break; } else { __label__ = 10; break; }
      case 13: // $76
        var $77=HEAP[$3];
        var $78=_rndr_newbuf($77);
        HEAP[$work]=$78;
        var $79=HEAP[$work];
        var $80=HEAP[$3];
        var $81=HEAP[$4];
        var $82=HEAP[$i];
        _parse_inline($79, $80, $81, $82);
        var $83=HEAP[$3];
        var $84=($83)&4294967295;
        var $85=($84+76)&4294967295;
        var $86=HEAP[$85];
        var $87=HEAP[$2];
        var $88=HEAP[$work];
        var $89=HEAP[$6];
        var $90=HEAP[$3];
        var $91=($90)&4294967295;
        var $92=($91+96)&4294967295;
        var $93=HEAP[$92];
        var $94=FUNCTION_TABLE[$86]($87, $88, $89, $93);
        HEAP[$r]=$94;
        var $95=HEAP[$3];
        _rndr_popbuf($95);
        var $96=HEAP[$r];
        var $97=((($96))|0)!=0;
        if ($97) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 14: // $98
        var $99=HEAP[$i];
        var $100=(($99) + 3)&4294967295;
        __lastLabel__ = 14; __label__ = 16; break;
      case 15: // $101
        __lastLabel__ = 15; __label__ = 16; break;
      case 16: // $102
        var $103=__lastLabel__ == 14 ? $100 : (0);
        HEAP[$1]=$103;
        __label__ = 5; break;
      case 10: // $104
        var $105=HEAP[$i];
        var $106=(($105) + 1)&4294967295;
        var $107=HEAP[$5];
        var $108=unSign(($106), 32, 0) < unSign(($107), 32, 0);
        if ($108) { __label__ = 17; break; } else { __label__ = 18; break; }
      case 17: // $109
        var $110=HEAP[$i];
        var $111=(($110) + 1)&4294967295;
        var $112=HEAP[$4];
        var $113=($112+$111)&4294967295;
        var $114=HEAP[$113];
        var $115=reSign(($114), 8, 0);
        var $116=HEAP[$6];
        var $117=reSign(($116), 8, 0);
        var $118=((($115))|0)==((($117))|0);
        if ($118) { __label__ = 19; break; } else { __label__ = 18; break; }
      case 19: // $119
        var $120=HEAP[$2];
        var $121=HEAP[$3];
        var $122=HEAP[$4];
        var $123=($122+-2)&4294967295;
        var $124=HEAP[$5];
        var $125=(($124) + 2)&4294967295;
        var $126=HEAP[$6];
        var $127=_parse_emph1($120, $121, $123, $125, $126);
        HEAP[$len]=$127;
        var $128=HEAP[$len];
        var $129=((($128))|0)!=0;
        if ($129) { __label__ = 20; break; } else { __label__ = 21; break; }
      case 21: // $130
        HEAP[$1]=0;
        __label__ = 5; break;
      case 20: // $131
        var $132=HEAP[$len];
        var $133=(($132) - 2)&4294967295;
        HEAP[$1]=$133;
        __label__ = 5; break;
      case 18: // $134
        var $135=HEAP[$2];
        var $136=HEAP[$3];
        var $137=HEAP[$4];
        var $138=($137+-1)&4294967295;
        var $139=HEAP[$5];
        var $140=(($139) + 1)&4294967295;
        var $141=HEAP[$6];
        var $142=_parse_emph2($135, $136, $138, $140, $141);
        HEAP[$len]=$142;
        var $143=HEAP[$len];
        var $144=((($143))|0)!=0;
        if ($144) { __label__ = 22; break; } else { __label__ = 23; break; }
      case 23: // $145
        HEAP[$1]=0;
        __label__ = 5; break;
      case 22: // $146
        var $147=HEAP[$len];
        var $148=(($147) - 1)&4294967295;
        HEAP[$1]=$148;
        __label__ = 5; break;
      case 2: // $149
        HEAP[$1]=0;
        __label__ = 5; break;
      case 5: // $150
        var $151=HEAP[$1];
        STACKTOP = __stackBase__;
        return $151;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _find_emph_char($data, $size, $c) {
    var __stackBase__  = STACKTOP; STACKTOP += 26; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 26);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $i=__stackBase__+13;
        var $tmp_i=__stackBase__+17;
        var $tmp_i1=__stackBase__+21;
        var $cc=__stackBase__+25;
        HEAP[$2]=$data;
        HEAP[$3]=$size;
        HEAP[$4]=$c;
        HEAP[$i]=1;
        __label__ = 0; break;
      case 0: // $5
        var $6=HEAP[$i];
        var $7=HEAP[$3];
        var $8=unSign(($6), 32, 0) < unSign(($7), 32, 0);
        if ($8) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $9
        __label__ = 3; break;
      case 3: // $10
        var $11=HEAP[$i];
        var $12=HEAP[$3];
        var $13=unSign(($11), 32, 0) < unSign(($12), 32, 0);
        if ($13) { __lastLabel__ = 3; __label__ = 4; break; } else { __lastLabel__ = 3; __label__ = 5; break; }
      case 4: // $14
        var $15=HEAP[$i];
        var $16=HEAP[$2];
        var $17=($16+$15)&4294967295;
        var $18=HEAP[$17];
        var $19=reSign(($18), 8, 0);
        var $20=HEAP[$4];
        var $21=reSign(($20), 8, 0);
        var $22=((($19))|0)!=((($21))|0);
        if ($22) { __lastLabel__ = 4; __label__ = 6; break; } else { __lastLabel__ = 4; __label__ = 5; break; }
      case 6: // $23
        var $24=HEAP[$i];
        var $25=HEAP[$2];
        var $26=($25+$24)&4294967295;
        var $27=HEAP[$26];
        var $28=reSign(($27), 8, 0);
        var $29=((($28))|0)!=96;
        if ($29) { __lastLabel__ = 6; __label__ = 7; break; } else { __lastLabel__ = 6; __label__ = 5; break; }
      case 7: // $30
        var $31=HEAP[$i];
        var $32=HEAP[$2];
        var $33=($32+$31)&4294967295;
        var $34=HEAP[$33];
        var $35=reSign(($34), 8, 0);
        var $36=((($35))|0)!=91;
        __lastLabel__ = 7; __label__ = 5; break;
      case 5: // $37
        var $38=__lastLabel__ == 6 ? 0 : (__lastLabel__ == 4 ? 0 : (__lastLabel__ == 3 ? 0 : ($36)));
        if ($38) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $39
        var $40=HEAP[$i];
        var $41=(($40) + 1)&4294967295;
        HEAP[$i]=$41;
        __label__ = 3; break;
      case 9: // $42
        var $43=HEAP[$i];
        var $44=HEAP[$2];
        var $45=($44+$43)&4294967295;
        var $46=HEAP[$45];
        var $47=reSign(($46), 8, 0);
        var $48=HEAP[$4];
        var $49=reSign(($48), 8, 0);
        var $50=((($47))|0)==((($49))|0);
        if ($50) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $51
        var $52=HEAP[$i];
        HEAP[$1]=$52;
        __label__ = 12; break;
      case 11: // $53
        var $54=HEAP[$i];
        var $55=((($54))|0)!=0;
        if ($55) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $56
        var $57=HEAP[$i];
        var $58=(($57) - 1)&4294967295;
        var $59=HEAP[$2];
        var $60=($59+$58)&4294967295;
        var $61=HEAP[$60];
        var $62=reSign(($61), 8, 0);
        var $63=((($62))|0)==92;
        if ($63) { __label__ = 15; break; } else { __label__ = 14; break; }
      case 15: // $64
        var $65=HEAP[$i];
        var $66=(($65) + 1)&4294967295;
        HEAP[$i]=$66;
        __label__ = 0; break;
      case 14: // $67
        var $68=HEAP[$i];
        var $69=HEAP[$2];
        var $70=($69+$68)&4294967295;
        var $71=HEAP[$70];
        var $72=reSign(($71), 8, 0);
        var $73=((($72))|0)==96;
        if ($73) { __label__ = 16; break; } else { __label__ = 17; break; }
      case 16: // $74
        HEAP[$tmp_i]=0;
        var $75=HEAP[$i];
        var $76=(($75) + 1)&4294967295;
        HEAP[$i]=$76;
        __label__ = 18; break;
      case 18: // $77
        var $78=HEAP[$i];
        var $79=HEAP[$3];
        var $80=unSign(($78), 32, 0) < unSign(($79), 32, 0);
        if ($80) { __lastLabel__ = 18; __label__ = 19; break; } else { __lastLabel__ = 18; __label__ = 20; break; }
      case 19: // $81
        var $82=HEAP[$i];
        var $83=HEAP[$2];
        var $84=($83+$82)&4294967295;
        var $85=HEAP[$84];
        var $86=reSign(($85), 8, 0);
        var $87=((($86))|0)!=96;
        __lastLabel__ = 19; __label__ = 20; break;
      case 20: // $88
        var $89=__lastLabel__ == 18 ? 0 : ($87);
        if ($89) { __label__ = 21; break; } else { __label__ = 22; break; }
      case 21: // $90
        var $91=HEAP[$tmp_i];
        var $92=((($91))|0)!=0;
        if ($92) { __label__ = 23; break; } else { __label__ = 24; break; }
      case 24: // $93
        var $94=HEAP[$i];
        var $95=HEAP[$2];
        var $96=($95+$94)&4294967295;
        var $97=HEAP[$96];
        var $98=reSign(($97), 8, 0);
        var $99=HEAP[$4];
        var $100=reSign(($99), 8, 0);
        var $101=((($98))|0)==((($100))|0);
        if ($101) { __label__ = 25; break; } else { __label__ = 23; break; }
      case 25: // $102
        var $103=HEAP[$i];
        HEAP[$tmp_i]=$103;
        __label__ = 23; break;
      case 23: // $104
        var $105=HEAP[$i];
        var $106=(($105) + 1)&4294967295;
        HEAP[$i]=$106;
        __label__ = 18; break;
      case 22: // $107
        var $108=HEAP[$i];
        var $109=HEAP[$3];
        var $110=unSign(($108), 32, 0) >= unSign(($109), 32, 0);
        if ($110) { __label__ = 26; break; } else { __label__ = 27; break; }
      case 26: // $111
        var $112=HEAP[$tmp_i];
        HEAP[$1]=$112;
        __label__ = 12; break;
      case 27: // $113
        var $114=HEAP[$i];
        var $115=(($114) + 1)&4294967295;
        HEAP[$i]=$115;
        __label__ = 28; break;
      case 17: // $116
        var $117=HEAP[$i];
        var $118=HEAP[$2];
        var $119=($118+$117)&4294967295;
        var $120=HEAP[$119];
        var $121=reSign(($120), 8, 0);
        var $122=((($121))|0)==91;
        if ($122) { __label__ = 29; break; } else { __label__ = 30; break; }
      case 29: // $123
        HEAP[$tmp_i1]=0;
        var $124=HEAP[$i];
        var $125=(($124) + 1)&4294967295;
        HEAP[$i]=$125;
        __label__ = 31; break;
      case 31: // $126
        var $127=HEAP[$i];
        var $128=HEAP[$3];
        var $129=unSign(($127), 32, 0) < unSign(($128), 32, 0);
        if ($129) { __lastLabel__ = 31; __label__ = 32; break; } else { __lastLabel__ = 31; __label__ = 33; break; }
      case 32: // $130
        var $131=HEAP[$i];
        var $132=HEAP[$2];
        var $133=($132+$131)&4294967295;
        var $134=HEAP[$133];
        var $135=reSign(($134), 8, 0);
        var $136=((($135))|0)!=93;
        __lastLabel__ = 32; __label__ = 33; break;
      case 33: // $137
        var $138=__lastLabel__ == 31 ? 0 : ($136);
        if ($138) { __label__ = 34; break; } else { __label__ = 35; break; }
      case 34: // $139
        var $140=HEAP[$tmp_i1];
        var $141=((($140))|0)!=0;
        if ($141) { __label__ = 36; break; } else { __label__ = 37; break; }
      case 37: // $142
        var $143=HEAP[$i];
        var $144=HEAP[$2];
        var $145=($144+$143)&4294967295;
        var $146=HEAP[$145];
        var $147=reSign(($146), 8, 0);
        var $148=HEAP[$4];
        var $149=reSign(($148), 8, 0);
        var $150=((($147))|0)==((($149))|0);
        if ($150) { __label__ = 38; break; } else { __label__ = 36; break; }
      case 38: // $151
        var $152=HEAP[$i];
        HEAP[$tmp_i1]=$152;
        __label__ = 36; break;
      case 36: // $153
        var $154=HEAP[$i];
        var $155=(($154) + 1)&4294967295;
        HEAP[$i]=$155;
        __label__ = 31; break;
      case 35: // $156
        var $157=HEAP[$i];
        var $158=(($157) + 1)&4294967295;
        HEAP[$i]=$158;
        __label__ = 39; break;
      case 39: // $159
        var $160=HEAP[$i];
        var $161=HEAP[$3];
        var $162=unSign(($160), 32, 0) < unSign(($161), 32, 0);
        if ($162) { __lastLabel__ = 39; __label__ = 40; break; } else { __lastLabel__ = 39; __label__ = 41; break; }
      case 40: // $163
        var $164=HEAP[$i];
        var $165=HEAP[$2];
        var $166=($165+$164)&4294967295;
        var $167=HEAP[$166];
        var $168=reSign(($167), 8, 0);
        var $169=((($168))|0)==32;
        if ($169) { __lastLabel__ = 40; __label__ = 42; break; } else { __lastLabel__ = 40; __label__ = 43; break; }
      case 43: // $170
        var $171=HEAP[$i];
        var $172=HEAP[$2];
        var $173=($172+$171)&4294967295;
        var $174=HEAP[$173];
        var $175=reSign(($174), 8, 0);
        var $176=((($175))|0)==9;
        if ($176) { __lastLabel__ = 43; __label__ = 42; break; } else { __lastLabel__ = 43; __label__ = 44; break; }
      case 44: // $177
        var $178=HEAP[$i];
        var $179=HEAP[$2];
        var $180=($179+$178)&4294967295;
        var $181=HEAP[$180];
        var $182=reSign(($181), 8, 0);
        var $183=((($182))|0)==10;
        __lastLabel__ = 44; __label__ = 42; break;
      case 42: // $184
        var $185=__lastLabel__ == 43 ? 1 : (__lastLabel__ == 40 ? 1 : ($183));
        __lastLabel__ = 42; __label__ = 41; break;
      case 41: // $186
        var $187=__lastLabel__ == 39 ? 0 : ($185);
        if ($187) { __label__ = 45; break; } else { __label__ = 46; break; }
      case 45: // $188
        var $189=HEAP[$i];
        var $190=(($189) + 1)&4294967295;
        HEAP[$i]=$190;
        __label__ = 39; break;
      case 46: // $191
        var $192=HEAP[$i];
        var $193=HEAP[$3];
        var $194=unSign(($192), 32, 0) >= unSign(($193), 32, 0);
        if ($194) { __label__ = 47; break; } else { __label__ = 48; break; }
      case 47: // $195
        var $196=HEAP[$tmp_i1];
        HEAP[$1]=$196;
        __label__ = 12; break;
      case 48: // $197
        var $198=HEAP[$i];
        var $199=HEAP[$2];
        var $200=($199+$198)&4294967295;
        var $201=HEAP[$200];
        var $202=reSign(($201), 8, 0);
        var $203=((($202))|0)!=91;
        if ($203) { __label__ = 49; break; } else { __label__ = 50; break; }
      case 49: // $204
        var $205=HEAP[$i];
        var $206=HEAP[$2];
        var $207=($206+$205)&4294967295;
        var $208=HEAP[$207];
        var $209=reSign(($208), 8, 0);
        var $210=((($209))|0)!=40;
        if ($210) { __label__ = 51; break; } else { __label__ = 50; break; }
      case 51: // $211
        var $212=HEAP[$tmp_i1];
        var $213=((($212))|0)!=0;
        if ($213) { __label__ = 52; break; } else { __label__ = 53; break; }
      case 52: // $214
        var $215=HEAP[$tmp_i1];
        HEAP[$1]=$215;
        __label__ = 12; break;
      case 53: // $216
        __label__ = 0; break;
      case 50: // $217
        var $218=HEAP[$i];
        var $219=HEAP[$2];
        var $220=($219+$218)&4294967295;
        var $221=HEAP[$220];
        HEAP[$cc]=$221;
        var $222=HEAP[$i];
        var $223=(($222) + 1)&4294967295;
        HEAP[$i]=$223;
        __label__ = 54; break;
      case 54: // $224
        var $225=HEAP[$i];
        var $226=HEAP[$3];
        var $227=unSign(($225), 32, 0) < unSign(($226), 32, 0);
        if ($227) { __lastLabel__ = 54; __label__ = 55; break; } else { __lastLabel__ = 54; __label__ = 56; break; }
      case 55: // $228
        var $229=HEAP[$i];
        var $230=HEAP[$2];
        var $231=($230+$229)&4294967295;
        var $232=HEAP[$231];
        var $233=reSign(($232), 8, 0);
        var $234=HEAP[$cc];
        var $235=reSign(($234), 8, 0);
        var $236=((($233))|0)!=((($235))|0);
        __lastLabel__ = 55; __label__ = 56; break;
      case 56: // $237
        var $238=__lastLabel__ == 54 ? 0 : ($236);
        if ($238) { __label__ = 57; break; } else { __label__ = 58; break; }
      case 57: // $239
        var $240=HEAP[$tmp_i1];
        var $241=((($240))|0)!=0;
        if ($241) { __label__ = 59; break; } else { __label__ = 60; break; }
      case 60: // $242
        var $243=HEAP[$i];
        var $244=HEAP[$2];
        var $245=($244+$243)&4294967295;
        var $246=HEAP[$245];
        var $247=reSign(($246), 8, 0);
        var $248=HEAP[$4];
        var $249=reSign(($248), 8, 0);
        var $250=((($247))|0)==((($249))|0);
        if ($250) { __label__ = 61; break; } else { __label__ = 59; break; }
      case 61: // $251
        var $252=HEAP[$i];
        HEAP[$tmp_i1]=$252;
        __label__ = 59; break;
      case 59: // $253
        var $254=HEAP[$i];
        var $255=(($254) + 1)&4294967295;
        HEAP[$i]=$255;
        __label__ = 54; break;
      case 58: // $256
        var $257=HEAP[$i];
        var $258=HEAP[$3];
        var $259=unSign(($257), 32, 0) >= unSign(($258), 32, 0);
        if ($259) { __label__ = 62; break; } else { __label__ = 63; break; }
      case 62: // $260
        var $261=HEAP[$tmp_i1];
        HEAP[$1]=$261;
        __label__ = 12; break;
      case 63: // $262
        var $263=HEAP[$i];
        var $264=(($263) + 1)&4294967295;
        HEAP[$i]=$264;
        __label__ = 30; break;
      case 30: // $265
        __label__ = 28; break;
      case 28: // $266
        __label__ = 0; break;
      case 2: // $267
        HEAP[$1]=0;
        __label__ = 12; break;
      case 12: // $268
        var $269=HEAP[$1];
        STACKTOP = __stackBase__;
        return $269;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _ispunct($_c) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 4);
    var __label__;
  
    var $1=__stackBase__;
    HEAP[$1]=$_c;
    var $2=HEAP[$1];
    var $3=___istype($2, 8192);
    STACKTOP = __stackBase__;
    return $3;
  }
  

  function _arr_adjust($arr) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 4);
    var __label__;
  
    var $1=__stackBase__;
    HEAP[$1]=$arr;
    var $2=HEAP[$1];
    var $3=HEAP[$1];
    var $4=($3+4)&4294967295;
    var $5=HEAP[$4];
    var $6=_arr_realloc($2, $5);
    STACKTOP = __stackBase__;
    return $6;
  }
  

  function _arr_realloc($arr, $neosz) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 16);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $neo=__stackBase__+12;
        HEAP[$2]=$arr;
        HEAP[$3]=$neosz;
        var $4=HEAP[$2];
        var $5=($4)&4294967295;
        var $6=HEAP[$5];
        var $7=HEAP[$3];
        var $8=HEAP[$2];
        var $9=($8+12)&4294967295;
        var $10=HEAP[$9];
        var $11=(($7) * ($10))&4294967295;
        var $12=_realloc($6, $11);
        HEAP[$neo]=$12;
        var $13=HEAP[$neo];
        var $14=($13)==0;
        if ($14) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $15
        HEAP[$1]=0;
        __label__ = 2; break;
      case 1: // $16
        var $17=HEAP[$neo];
        var $18=HEAP[$2];
        var $19=($18)&4294967295;
        HEAP[$19]=$17;
        var $20=HEAP[$3];
        var $21=HEAP[$2];
        var $22=($21+8)&4294967295;
        HEAP[$22]=$20;
        var $23=HEAP[$2];
        var $24=($23+4)&4294967295;
        var $25=HEAP[$24];
        var $26=HEAP[$3];
        var $27=((($25))|0) > ((($26))|0);
        if ($27) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $28
        var $29=HEAP[$3];
        var $30=HEAP[$2];
        var $31=($30+4)&4294967295;
        HEAP[$31]=$29;
        __label__ = 4; break;
      case 4: // $32
        HEAP[$1]=1;
        __label__ = 2; break;
      case 2: // $33
        var $34=HEAP[$1];
        STACKTOP = __stackBase__;
        return $34;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _arr_free($arr) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 4);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        HEAP[$1]=$arr;
        var $2=HEAP[$1];
        var $3=($2)!=0;
        if ($3) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $4
        __label__ = 2; break;
      case 0: // $5
        var $6=HEAP[$1];
        var $7=($6)&4294967295;
        var $8=HEAP[$7];
        _free($8);
        var $9=HEAP[$1];
        var $10=($9)&4294967295;
        HEAP[$10]=0;
        var $11=HEAP[$1];
        var $12=($11+8)&4294967295;
        HEAP[$12]=0;
        var $13=HEAP[$1];
        var $14=($13+4)&4294967295;
        HEAP[$14]=0;
        __label__ = 2; break;
      case 2: // $15
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _arr_grow($arr, $need) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 12);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        HEAP[$2]=$arr;
        HEAP[$3]=$need;
        var $4=HEAP[$2];
        var $5=($4+8)&4294967295;
        var $6=HEAP[$5];
        var $7=HEAP[$3];
        var $8=((($6))|0) >= ((($7))|0);
        if ($8) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $9
        HEAP[$1]=1;
        __label__ = 2; break;
      case 1: // $10
        var $11=HEAP[$2];
        var $12=HEAP[$3];
        var $13=_arr_realloc($11, $12);
        HEAP[$1]=$13;
        __label__ = 2; break;
      case 2: // $14
        var $15=HEAP[$1];
        STACKTOP = __stackBase__;
        return $15;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _arr_init($arr, $unit) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 8);
    var __label__;
  
    var $1=__stackBase__;
    var $2=__stackBase__+4;
    HEAP[$1]=$arr;
    HEAP[$2]=$unit;
    var $3=HEAP[$1];
    var $4=($3)&4294967295;
    HEAP[$4]=0;
    var $5=HEAP[$1];
    var $6=($5+8)&4294967295;
    HEAP[$6]=0;
    var $7=HEAP[$1];
    var $8=($7+4)&4294967295;
    HEAP[$8]=0;
    var $9=HEAP[$2];
    var $10=HEAP[$1];
    var $11=($10+12)&4294967295;
    HEAP[$11]=$9;
    STACKTOP = __stackBase__;
    return;
  }
  

  function _arr_insert($arr, $nb, $n) {
    var __stackBase__  = STACKTOP; STACKTOP += 28; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 28);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $src=__stackBase__+16;
        var $dst=__stackBase__+20;
        var $len=__stackBase__+24;
        HEAP[$2]=$arr;
        HEAP[$3]=$nb;
        HEAP[$4]=$n;
        var $5=HEAP[$2];
        var $6=($5)!=0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        var $8=HEAP[$3];
        var $9=((($8))|0) <= 0;
        if ($9) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 2: // $10
        var $11=HEAP[$4];
        var $12=((($11))|0) < 0;
        if ($12) { __label__ = 1; break; } else { __label__ = 3; break; }
      case 3: // $13
        var $14=HEAP[$2];
        var $15=HEAP[$2];
        var $16=($15+4)&4294967295;
        var $17=HEAP[$16];
        var $18=HEAP[$3];
        var $19=(($17) + ($18))&4294967295;
        var $20=_arr_grow($14, $19);
        var $21=((($20))|0)!=0;
        if ($21) { __label__ = 4; break; } else { __label__ = 1; break; }
      case 1: // $22
        HEAP[$1]=0;
        __label__ = 5; break;
      case 4: // $23
        var $24=HEAP[$4];
        var $25=HEAP[$2];
        var $26=($25+4)&4294967295;
        var $27=HEAP[$26];
        var $28=((($24))|0) < ((($27))|0);
        if ($28) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $29
        var $30=HEAP[$2];
        var $31=($30)&4294967295;
        var $32=HEAP[$31];
        HEAP[$src]=$32;
        var $33=HEAP[$4];
        var $34=HEAP[$2];
        var $35=($34+12)&4294967295;
        var $36=HEAP[$35];
        var $37=(($33) * ($36))&4294967295;
        var $38=HEAP[$src];
        var $39=($38+$37)&4294967295;
        HEAP[$src]=$39;
        var $40=HEAP[$src];
        var $41=HEAP[$3];
        var $42=HEAP[$2];
        var $43=($42+12)&4294967295;
        var $44=HEAP[$43];
        var $45=(($41) * ($44))&4294967295;
        var $46=($40+$45)&4294967295;
        HEAP[$dst]=$46;
        var $47=HEAP[$2];
        var $48=($47+4)&4294967295;
        var $49=HEAP[$48];
        var $50=HEAP[$4];
        var $51=(($49) - ($50))&4294967295;
        var $52=HEAP[$2];
        var $53=($52+12)&4294967295;
        var $54=HEAP[$53];
        var $55=(($51) * ($54))&4294967295;
        HEAP[$len]=$55;
        var $56=HEAP[$dst];
        var $57=HEAP[$src];
        var $58=HEAP[$len];
        _llvm_memmove_p0i8_p0i8_i32($56, $57, $58, 1, 0);
        __label__ = 7; break;
      case 7: // $59
        var $60=HEAP[$3];
        var $61=HEAP[$2];
        var $62=($61+4)&4294967295;
        var $63=HEAP[$62];
        var $64=(($63) + ($60))&4294967295;
        HEAP[$62]=$64;
        HEAP[$1]=1;
        __label__ = 5; break;
      case 5: // $65
        var $66=HEAP[$1];
        STACKTOP = __stackBase__;
        return $66;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _arr_item($arr, $no) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 16);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $ptr=__stackBase__+12;
        HEAP[$2]=$arr;
        HEAP[$3]=$no;
        var $4=HEAP[$2];
        var $5=($4)!=0;
        if ($5) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $6
        var $7=HEAP[$3];
        var $8=((($7))|0) < 0;
        if ($8) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 2: // $9
        var $10=HEAP[$3];
        var $11=HEAP[$2];
        var $12=($11+4)&4294967295;
        var $13=HEAP[$12];
        var $14=((($10))|0) >= ((($13))|0);
        if ($14) { __label__ = 1; break; } else { __label__ = 3; break; }
      case 1: // $15
        HEAP[$1]=0;
        __label__ = 4; break;
      case 3: // $16
        var $17=HEAP[$2];
        var $18=($17)&4294967295;
        var $19=HEAP[$18];
        HEAP[$ptr]=$19;
        var $20=HEAP[$3];
        var $21=HEAP[$2];
        var $22=($21+12)&4294967295;
        var $23=HEAP[$22];
        var $24=(($20) * ($23))&4294967295;
        var $25=HEAP[$ptr];
        var $26=($25+$24)&4294967295;
        HEAP[$ptr]=$26;
        var $27=HEAP[$ptr];
        HEAP[$1]=$27;
        __label__ = 4; break;
      case 4: // $28
        var $29=HEAP[$1];
        STACKTOP = __stackBase__;
        return $29;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _arr_newitem($arr) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 8);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        HEAP[$2]=$arr;
        var $3=HEAP[$2];
        var $4=HEAP[$2];
        var $5=($4+4)&4294967295;
        var $6=HEAP[$5];
        var $7=(($6) + 1)&4294967295;
        var $8=_arr_grow($3, $7);
        var $9=((($8))|0)!=0;
        if ($9) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $10
        HEAP[$1]=-1;
        __label__ = 2; break;
      case 0: // $11
        var $12=HEAP[$2];
        var $13=($12+4)&4294967295;
        var $14=HEAP[$13];
        var $15=(($14) + 1)&4294967295;
        HEAP[$13]=$15;
        var $16=HEAP[$2];
        var $17=($16+4)&4294967295;
        var $18=HEAP[$17];
        var $19=(($18) - 1)&4294967295;
        HEAP[$1]=$19;
        __label__ = 2; break;
      case 2: // $20
        var $21=HEAP[$1];
        STACKTOP = __stackBase__;
        return $21;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _arr_remove($arr, $idx) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 16);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $dst=__stackBase__+8;
        var $src=__stackBase__+12;
        HEAP[$1]=$arr;
        HEAP[$2]=$idx;
        var $3=HEAP[$1];
        var $4=($3)!=0;
        if ($4) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $5
        var $6=HEAP[$2];
        var $7=((($6))|0) < 0;
        if ($7) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 2: // $8
        var $9=HEAP[$2];
        var $10=HEAP[$1];
        var $11=($10+4)&4294967295;
        var $12=HEAP[$11];
        var $13=((($9))|0) >= ((($12))|0);
        if ($13) { __label__ = 1; break; } else { __label__ = 3; break; }
      case 1: // $14
        __label__ = 4; break;
      case 3: // $15
        var $16=HEAP[$1];
        var $17=($16+4)&4294967295;
        var $18=HEAP[$17];
        var $19=(($18) - 1)&4294967295;
        HEAP[$17]=$19;
        var $20=HEAP[$2];
        var $21=HEAP[$1];
        var $22=($21+4)&4294967295;
        var $23=HEAP[$22];
        var $24=((($20))|0) < ((($23))|0);
        if ($24) { __label__ = 5; break; } else { __label__ = 4; break; }
      case 5: // $25
        var $26=HEAP[$1];
        var $27=($26)&4294967295;
        var $28=HEAP[$27];
        HEAP[$dst]=$28;
        var $29=HEAP[$2];
        var $30=HEAP[$1];
        var $31=($30+12)&4294967295;
        var $32=HEAP[$31];
        var $33=(($29) * ($32))&4294967295;
        var $34=HEAP[$dst];
        var $35=($34+$33)&4294967295;
        HEAP[$dst]=$35;
        var $36=HEAP[$dst];
        var $37=HEAP[$1];
        var $38=($37+12)&4294967295;
        var $39=HEAP[$38];
        var $40=($36+$39)&4294967295;
        HEAP[$src]=$40;
        var $41=HEAP[$dst];
        var $42=HEAP[$src];
        var $43=HEAP[$1];
        var $44=($43+4)&4294967295;
        var $45=HEAP[$44];
        var $46=HEAP[$2];
        var $47=(($45) - ($46))&4294967295;
        var $48=HEAP[$1];
        var $49=($48+12)&4294967295;
        var $50=HEAP[$49];
        var $51=(($47) * ($50))&4294967295;
        _llvm_memmove_p0i8_p0i8_i32($41, $42, $51, 1, 0);
        __label__ = 4; break;
      case 4: // $52
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _arr_sorted_find($arr, $key, $cmp) {
    var __stackBase__  = STACKTOP; STACKTOP += 36; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 36);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $mi=__stackBase__+16;
        var $ma=__stackBase__+20;
        var $cu=__stackBase__+24;
        var $ret=__stackBase__+28;
        var $ptr=__stackBase__+32;
        HEAP[$2]=$arr;
        HEAP[$3]=$key;
        HEAP[$4]=$cmp;
        var $5=HEAP[$2];
        var $6=($5)&4294967295;
        var $7=HEAP[$6];
        HEAP[$ptr]=$7;
        HEAP[$mi]=-1;
        var $8=HEAP[$2];
        var $9=($8+4)&4294967295;
        var $10=HEAP[$9];
        HEAP[$ma]=$10;
        __label__ = 0; break;
      case 0: // $11
        var $12=HEAP[$mi];
        var $13=HEAP[$ma];
        var $14=(($13) - 1)&4294967295;
        var $15=((($12))|0) < ((($14))|0);
        if ($15) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $16
        var $17=HEAP[$mi];
        var $18=HEAP[$ma];
        var $19=HEAP[$mi];
        var $20=(($18) - ($19))&4294967295;
        var $21=(((($20))|0)/2|0);
        var $22=(($17) + ($21))&4294967295;
        HEAP[$cu]=$22;
        var $23=HEAP[$4];
        var $24=HEAP[$3];
        var $25=HEAP[$ptr];
        var $26=HEAP[$cu];
        var $27=HEAP[$2];
        var $28=($27+12)&4294967295;
        var $29=HEAP[$28];
        var $30=(($26) * ($29))&4294967295;
        var $31=($25+$30)&4294967295;
        var $32=FUNCTION_TABLE[$23]($24, $31);
        HEAP[$ret]=$32;
        var $33=HEAP[$ret];
        var $34=((($33))|0)==0;
        if ($34) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $35
        var $36=HEAP[$ptr];
        var $37=HEAP[$cu];
        var $38=HEAP[$2];
        var $39=($38+12)&4294967295;
        var $40=HEAP[$39];
        var $41=(($37) * ($40))&4294967295;
        var $42=($36+$41)&4294967295;
        HEAP[$1]=$42;
        __label__ = 5; break;
      case 4: // $43
        var $44=HEAP[$ret];
        var $45=((($44))|0) < 0;
        if ($45) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $46
        var $47=HEAP[$cu];
        HEAP[$ma]=$47;
        __label__ = 8; break;
      case 7: // $48
        var $49=HEAP[$cu];
        HEAP[$mi]=$49;
        __label__ = 8; break;
      case 8: // $50
        __label__ = 9; break;
      case 9: // $51
        __label__ = 0; break;
      case 2: // $52
        HEAP[$1]=0;
        __label__ = 5; break;
      case 5: // $53
        var $54=HEAP[$1];
        STACKTOP = __stackBase__;
        return $54;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _arr_sorted_find_i($arr, $key, $cmp) {
    var __stackBase__  = STACKTOP; STACKTOP += 36; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 36);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $mi=__stackBase__+16;
        var $ma=__stackBase__+20;
        var $cu=__stackBase__+24;
        var $ret=__stackBase__+28;
        var $ptr=__stackBase__+32;
        HEAP[$2]=$arr;
        HEAP[$3]=$key;
        HEAP[$4]=$cmp;
        var $5=HEAP[$2];
        var $6=($5)&4294967295;
        var $7=HEAP[$6];
        HEAP[$ptr]=$7;
        HEAP[$mi]=-1;
        var $8=HEAP[$2];
        var $9=($8+4)&4294967295;
        var $10=HEAP[$9];
        HEAP[$ma]=$10;
        __label__ = 0; break;
      case 0: // $11
        var $12=HEAP[$mi];
        var $13=HEAP[$ma];
        var $14=(($13) - 1)&4294967295;
        var $15=((($12))|0) < ((($14))|0);
        if ($15) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $16
        var $17=HEAP[$mi];
        var $18=HEAP[$ma];
        var $19=HEAP[$mi];
        var $20=(($18) - ($19))&4294967295;
        var $21=(((($20))|0)/2|0);
        var $22=(($17) + ($21))&4294967295;
        HEAP[$cu]=$22;
        var $23=HEAP[$4];
        var $24=HEAP[$3];
        var $25=HEAP[$ptr];
        var $26=HEAP[$cu];
        var $27=HEAP[$2];
        var $28=($27+12)&4294967295;
        var $29=HEAP[$28];
        var $30=(($26) * ($29))&4294967295;
        var $31=($25+$30)&4294967295;
        var $32=FUNCTION_TABLE[$23]($24, $31);
        HEAP[$ret]=$32;
        var $33=HEAP[$ret];
        var $34=((($33))|0)==0;
        if ($34) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $35
        __label__ = 5; break;
      case 5: // $36
        var $37=HEAP[$cu];
        var $38=HEAP[$2];
        var $39=($38+4)&4294967295;
        var $40=HEAP[$39];
        var $41=((($37))|0) < ((($40))|0);
        if ($41) { __lastLabel__ = 5; __label__ = 6; break; } else { __lastLabel__ = 5; __label__ = 7; break; }
      case 6: // $42
        var $43=HEAP[$ret];
        var $44=((($43))|0)==0;
        __lastLabel__ = 6; __label__ = 7; break;
      case 7: // $45
        var $46=__lastLabel__ == 5 ? 0 : ($44);
        if ($46) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $47
        var $48=HEAP[$cu];
        var $49=(($48) + 1)&4294967295;
        HEAP[$cu]=$49;
        var $50=HEAP[$4];
        var $51=HEAP[$3];
        var $52=HEAP[$ptr];
        var $53=HEAP[$cu];
        var $54=HEAP[$2];
        var $55=($54+12)&4294967295;
        var $56=HEAP[$55];
        var $57=(($53) * ($56))&4294967295;
        var $58=($52+$57)&4294967295;
        var $59=FUNCTION_TABLE[$50]($51, $58);
        HEAP[$ret]=$59;
        __label__ = 5; break;
      case 9: // $60
        var $61=HEAP[$cu];
        HEAP[$1]=$61;
        __label__ = 10; break;
      case 4: // $62
        var $63=HEAP[$ret];
        var $64=((($63))|0) < 0;
        if ($64) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $65
        var $66=HEAP[$cu];
        HEAP[$ma]=$66;
        __label__ = 13; break;
      case 12: // $67
        var $68=HEAP[$cu];
        HEAP[$mi]=$68;
        __label__ = 13; break;
      case 13: // $69
        __label__ = 14; break;
      case 14: // $70
        __label__ = 0; break;
      case 2: // $71
        var $72=HEAP[$ma];
        HEAP[$1]=$72;
        __label__ = 10; break;
      case 10: // $73
        var $74=HEAP[$1];
        STACKTOP = __stackBase__;
        return $74;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parr_adjust($arr) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 4);
    var __label__;
  
    var $1=__stackBase__;
    HEAP[$1]=$arr;
    var $2=HEAP[$1];
    var $3=HEAP[$1];
    var $4=($3+4)&4294967295;
    var $5=HEAP[$4];
    var $6=_parr_realloc($2, $5);
    STACKTOP = __stackBase__;
    return $6;
  }
  

  function _parr_realloc($arr, $neosz) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 16);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $neo=__stackBase__+12;
        HEAP[$2]=$arr;
        HEAP[$3]=$neosz;
        var $4=HEAP[$2];
        var $5=($4)&4294967295;
        var $6=HEAP[$5];
        var $7=$6;
        var $8=HEAP[$3];
        var $9=(($8) * 4)&4294967295;
        var $10=_realloc($7, $9);
        HEAP[$neo]=$10;
        var $11=HEAP[$neo];
        var $12=($11)==0;
        if ($12) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $13
        HEAP[$1]=0;
        __label__ = 2; break;
      case 1: // $14
        var $15=HEAP[$neo];
        var $16=$15;
        var $17=HEAP[$2];
        var $18=($17)&4294967295;
        HEAP[$18]=$16;
        var $19=HEAP[$3];
        var $20=HEAP[$2];
        var $21=($20+8)&4294967295;
        HEAP[$21]=$19;
        var $22=HEAP[$2];
        var $23=($22+4)&4294967295;
        var $24=HEAP[$23];
        var $25=HEAP[$3];
        var $26=((($24))|0) > ((($25))|0);
        if ($26) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $27
        var $28=HEAP[$3];
        var $29=HEAP[$2];
        var $30=($29+4)&4294967295;
        HEAP[$30]=$28;
        __label__ = 4; break;
      case 4: // $31
        HEAP[$1]=1;
        __label__ = 2; break;
      case 2: // $32
        var $33=HEAP[$1];
        STACKTOP = __stackBase__;
        return $33;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parr_free($arr) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 4);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        HEAP[$1]=$arr;
        var $2=HEAP[$1];
        var $3=($2)!=0;
        if ($3) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $4
        __label__ = 2; break;
      case 0: // $5
        var $6=HEAP[$1];
        var $7=($6)&4294967295;
        var $8=HEAP[$7];
        var $9=$8;
        _free($9);
        var $10=HEAP[$1];
        var $11=($10)&4294967295;
        HEAP[$11]=0;
        var $12=HEAP[$1];
        var $13=($12+4)&4294967295;
        HEAP[$13]=0;
        var $14=HEAP[$1];
        var $15=($14+8)&4294967295;
        HEAP[$15]=0;
        __label__ = 2; break;
      case 2: // $16
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parr_grow($arr, $need) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 12);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        HEAP[$2]=$arr;
        HEAP[$3]=$need;
        var $4=HEAP[$2];
        var $5=($4+8)&4294967295;
        var $6=HEAP[$5];
        var $7=HEAP[$3];
        var $8=((($6))|0) >= ((($7))|0);
        if ($8) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $9
        HEAP[$1]=1;
        __label__ = 2; break;
      case 1: // $10
        var $11=HEAP[$2];
        var $12=HEAP[$3];
        var $13=_parr_realloc($11, $12);
        HEAP[$1]=$13;
        __label__ = 2; break;
      case 2: // $14
        var $15=HEAP[$1];
        STACKTOP = __stackBase__;
        return $15;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parr_init($arr) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 4);
    var __label__;
  
    var $1=__stackBase__;
    HEAP[$1]=$arr;
    var $2=HEAP[$1];
    var $3=($2)&4294967295;
    HEAP[$3]=0;
    var $4=HEAP[$1];
    var $5=($4+4)&4294967295;
    HEAP[$5]=0;
    var $6=HEAP[$1];
    var $7=($6+8)&4294967295;
    HEAP[$7]=0;
    STACKTOP = __stackBase__;
    return;
  }
  

  function _parr_insert($parr, $nb, $n) {
    var __stackBase__  = STACKTOP; STACKTOP += 32; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 32);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $src=__stackBase__+16;
        var $dst=__stackBase__+20;
        var $len=__stackBase__+24;
        var $i=__stackBase__+28;
        HEAP[$2]=$parr;
        HEAP[$3]=$nb;
        HEAP[$4]=$n;
        var $5=HEAP[$2];
        var $6=($5)!=0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        var $8=HEAP[$3];
        var $9=((($8))|0) <= 0;
        if ($9) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 2: // $10
        var $11=HEAP[$4];
        var $12=((($11))|0) < 0;
        if ($12) { __label__ = 1; break; } else { __label__ = 3; break; }
      case 3: // $13
        var $14=HEAP[$2];
        var $15=HEAP[$2];
        var $16=($15+4)&4294967295;
        var $17=HEAP[$16];
        var $18=HEAP[$3];
        var $19=(($17) + ($18))&4294967295;
        var $20=_parr_grow($14, $19);
        var $21=((($20))|0)!=0;
        if ($21) { __label__ = 4; break; } else { __label__ = 1; break; }
      case 1: // $22
        HEAP[$1]=0;
        __label__ = 5; break;
      case 4: // $23
        var $24=HEAP[$4];
        var $25=HEAP[$2];
        var $26=($25+4)&4294967295;
        var $27=HEAP[$26];
        var $28=((($24))|0) < ((($27))|0);
        if ($28) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $29
        var $30=HEAP[$2];
        var $31=($30)&4294967295;
        var $32=HEAP[$31];
        var $33=$32;
        HEAP[$src]=$33;
        var $34=HEAP[$4];
        var $35=(($34) * 4)&4294967295;
        var $36=HEAP[$src];
        var $37=($36+$35)&4294967295;
        HEAP[$src]=$37;
        var $38=HEAP[$src];
        var $39=HEAP[$3];
        var $40=(($39) * 4)&4294967295;
        var $41=($38+$40)&4294967295;
        HEAP[$dst]=$41;
        var $42=HEAP[$2];
        var $43=($42+4)&4294967295;
        var $44=HEAP[$43];
        var $45=HEAP[$4];
        var $46=(($44) - ($45))&4294967295;
        var $47=(($46) * 4)&4294967295;
        HEAP[$len]=$47;
        var $48=HEAP[$dst];
        var $49=HEAP[$src];
        var $50=HEAP[$len];
        _llvm_memmove_p0i8_p0i8_i32($48, $49, $50, 1, 0);
        HEAP[$i]=0;
        __label__ = 8; break;
      case 8: // $51
        var $52=HEAP[$i];
        var $53=HEAP[$3];
        var $54=unSign(($52), 32, 0) < unSign(($53), 32, 0);
        if ($54) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $55
        var $56=HEAP[$4];
        var $57=HEAP[$i];
        var $58=(($56) + ($57))&4294967295;
        var $59=HEAP[$2];
        var $60=($59)&4294967295;
        var $61=HEAP[$60];
        var $62=($61+4*$58)&4294967295;
        HEAP[$62]=0;
        __label__ = 11; break;
      case 11: // $63
        var $64=HEAP[$i];
        var $65=(($64) + 1)&4294967295;
        HEAP[$i]=$65;
        __label__ = 8; break;
      case 10: // $66
        __label__ = 7; break;
      case 7: // $67
        var $68=HEAP[$3];
        var $69=HEAP[$2];
        var $70=($69+4)&4294967295;
        var $71=HEAP[$70];
        var $72=(($71) + ($68))&4294967295;
        HEAP[$70]=$72;
        HEAP[$1]=1;
        __label__ = 5; break;
      case 5: // $73
        var $74=HEAP[$1];
        STACKTOP = __stackBase__;
        return $74;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parr_pop($arr) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 8);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        HEAP[$2]=$arr;
        var $3=HEAP[$2];
        var $4=($3+4)&4294967295;
        var $5=HEAP[$4];
        var $6=((($5))|0) <= 0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1]=0;
        __label__ = 2; break;
      case 1: // $8
        var $9=HEAP[$2];
        var $10=($9+4)&4294967295;
        var $11=HEAP[$10];
        var $12=(($11) - 1)&4294967295;
        HEAP[$10]=$12;
        var $13=HEAP[$2];
        var $14=($13+4)&4294967295;
        var $15=HEAP[$14];
        var $16=HEAP[$2];
        var $17=($16)&4294967295;
        var $18=HEAP[$17];
        var $19=($18+4*$15)&4294967295;
        var $20=HEAP[$19];
        HEAP[$1]=$20;
        __label__ = 2; break;
      case 2: // $21
        var $22=HEAP[$1];
        STACKTOP = __stackBase__;
        return $22;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parr_push($arr, $i) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 12);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        HEAP[$2]=$arr;
        HEAP[$3]=$i;
        var $4=HEAP[$2];
        var $5=HEAP[$2];
        var $6=($5+4)&4294967295;
        var $7=HEAP[$6];
        var $8=(($7) + 1)&4294967295;
        var $9=_parr_grow($4, $8);
        var $10=((($9))|0)!=0;
        if ($10) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $11
        HEAP[$1]=0;
        __label__ = 2; break;
      case 0: // $12
        var $13=HEAP[$3];
        var $14=HEAP[$2];
        var $15=($14+4)&4294967295;
        var $16=HEAP[$15];
        var $17=HEAP[$2];
        var $18=($17)&4294967295;
        var $19=HEAP[$18];
        var $20=($19+4*$16)&4294967295;
        HEAP[$20]=$13;
        var $21=HEAP[$2];
        var $22=($21+4)&4294967295;
        var $23=HEAP[$22];
        var $24=(($23) + 1)&4294967295;
        HEAP[$22]=$24;
        HEAP[$1]=1;
        __label__ = 2; break;
      case 2: // $25
        var $26=HEAP[$1];
        STACKTOP = __stackBase__;
        return $26;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parr_remove($arr, $idx) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 20);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $ret=__stackBase__+12;
        var $i=__stackBase__+16;
        HEAP[$2]=$arr;
        HEAP[$3]=$idx;
        var $4=HEAP[$2];
        var $5=($4)!=0;
        if ($5) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $6
        var $7=HEAP[$3];
        var $8=((($7))|0) < 0;
        if ($8) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 2: // $9
        var $10=HEAP[$3];
        var $11=HEAP[$2];
        var $12=($11+4)&4294967295;
        var $13=HEAP[$12];
        var $14=((($10))|0) >= ((($13))|0);
        if ($14) { __label__ = 1; break; } else { __label__ = 3; break; }
      case 1: // $15
        HEAP[$1]=0;
        __label__ = 4; break;
      case 3: // $16
        var $17=HEAP[$3];
        var $18=HEAP[$2];
        var $19=($18)&4294967295;
        var $20=HEAP[$19];
        var $21=($20+4*$17)&4294967295;
        var $22=HEAP[$21];
        HEAP[$ret]=$22;
        var $23=HEAP[$3];
        var $24=(($23) + 1)&4294967295;
        HEAP[$i]=$24;
        __label__ = 5; break;
      case 5: // $25
        var $26=HEAP[$i];
        var $27=HEAP[$2];
        var $28=($27+4)&4294967295;
        var $29=HEAP[$28];
        var $30=((($26))|0) < ((($29))|0);
        if ($30) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $31
        var $32=HEAP[$i];
        var $33=HEAP[$2];
        var $34=($33)&4294967295;
        var $35=HEAP[$34];
        var $36=($35+4*$32)&4294967295;
        var $37=HEAP[$36];
        var $38=HEAP[$i];
        var $39=(($38) - 1)&4294967295;
        var $40=HEAP[$2];
        var $41=($40)&4294967295;
        var $42=HEAP[$41];
        var $43=($42+4*$39)&4294967295;
        HEAP[$43]=$37;
        __label__ = 8; break;
      case 8: // $44
        var $45=HEAP[$i];
        var $46=(($45) + 1)&4294967295;
        HEAP[$i]=$46;
        __label__ = 5; break;
      case 7: // $47
        var $48=HEAP[$2];
        var $49=($48+4)&4294967295;
        var $50=HEAP[$49];
        var $51=(($50) - 1)&4294967295;
        HEAP[$49]=$51;
        var $52=HEAP[$ret];
        HEAP[$1]=$52;
        __label__ = 4; break;
      case 4: // $53
        var $54=HEAP[$1];
        STACKTOP = __stackBase__;
        return $54;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parr_sorted_find($arr, $key, $cmp) {
    var __stackBase__  = STACKTOP; STACKTOP += 32; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 32);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $mi=__stackBase__+16;
        var $ma=__stackBase__+20;
        var $cu=__stackBase__+24;
        var $ret=__stackBase__+28;
        HEAP[$2]=$arr;
        HEAP[$3]=$key;
        HEAP[$4]=$cmp;
        HEAP[$mi]=-1;
        var $5=HEAP[$2];
        var $6=($5+4)&4294967295;
        var $7=HEAP[$6];
        HEAP[$ma]=$7;
        __label__ = 0; break;
      case 0: // $8
        var $9=HEAP[$mi];
        var $10=HEAP[$ma];
        var $11=(($10) - 1)&4294967295;
        var $12=((($9))|0) < ((($11))|0);
        if ($12) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $13
        var $14=HEAP[$mi];
        var $15=HEAP[$ma];
        var $16=HEAP[$mi];
        var $17=(($15) - ($16))&4294967295;
        var $18=(((($17))|0)/2|0);
        var $19=(($14) + ($18))&4294967295;
        HEAP[$cu]=$19;
        var $20=HEAP[$4];
        var $21=HEAP[$3];
        var $22=HEAP[$cu];
        var $23=HEAP[$2];
        var $24=($23)&4294967295;
        var $25=HEAP[$24];
        var $26=($25+4*$22)&4294967295;
        var $27=HEAP[$26];
        var $28=FUNCTION_TABLE[$20]($21, $27);
        HEAP[$ret]=$28;
        var $29=HEAP[$ret];
        var $30=((($29))|0)==0;
        if ($30) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $31
        var $32=HEAP[$cu];
        var $33=HEAP[$2];
        var $34=($33)&4294967295;
        var $35=HEAP[$34];
        var $36=($35+4*$32)&4294967295;
        var $37=HEAP[$36];
        HEAP[$1]=$37;
        __label__ = 5; break;
      case 4: // $38
        var $39=HEAP[$ret];
        var $40=((($39))|0) < 0;
        if ($40) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $41
        var $42=HEAP[$cu];
        HEAP[$ma]=$42;
        __label__ = 8; break;
      case 7: // $43
        var $44=HEAP[$cu];
        HEAP[$mi]=$44;
        __label__ = 8; break;
      case 8: // $45
        __label__ = 9; break;
      case 9: // $46
        __label__ = 0; break;
      case 2: // $47
        HEAP[$1]=0;
        __label__ = 5; break;
      case 5: // $48
        var $49=HEAP[$1];
        STACKTOP = __stackBase__;
        return $49;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parr_sorted_find_i($arr, $key, $cmp) {
    var __stackBase__  = STACKTOP; STACKTOP += 32; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 32);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $mi=__stackBase__+16;
        var $ma=__stackBase__+20;
        var $cu=__stackBase__+24;
        var $ret=__stackBase__+28;
        HEAP[$2]=$arr;
        HEAP[$3]=$key;
        HEAP[$4]=$cmp;
        HEAP[$mi]=-1;
        var $5=HEAP[$2];
        var $6=($5+4)&4294967295;
        var $7=HEAP[$6];
        HEAP[$ma]=$7;
        __label__ = 0; break;
      case 0: // $8
        var $9=HEAP[$mi];
        var $10=HEAP[$ma];
        var $11=(($10) - 1)&4294967295;
        var $12=((($9))|0) < ((($11))|0);
        if ($12) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $13
        var $14=HEAP[$mi];
        var $15=HEAP[$ma];
        var $16=HEAP[$mi];
        var $17=(($15) - ($16))&4294967295;
        var $18=(((($17))|0)/2|0);
        var $19=(($14) + ($18))&4294967295;
        HEAP[$cu]=$19;
        var $20=HEAP[$4];
        var $21=HEAP[$3];
        var $22=HEAP[$cu];
        var $23=HEAP[$2];
        var $24=($23)&4294967295;
        var $25=HEAP[$24];
        var $26=($25+4*$22)&4294967295;
        var $27=HEAP[$26];
        var $28=FUNCTION_TABLE[$20]($21, $27);
        HEAP[$ret]=$28;
        var $29=HEAP[$ret];
        var $30=((($29))|0)==0;
        if ($30) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $31
        __label__ = 5; break;
      case 5: // $32
        var $33=HEAP[$cu];
        var $34=HEAP[$2];
        var $35=($34+4)&4294967295;
        var $36=HEAP[$35];
        var $37=((($33))|0) < ((($36))|0);
        if ($37) { __lastLabel__ = 5; __label__ = 6; break; } else { __lastLabel__ = 5; __label__ = 7; break; }
      case 6: // $38
        var $39=HEAP[$ret];
        var $40=((($39))|0)==0;
        __lastLabel__ = 6; __label__ = 7; break;
      case 7: // $41
        var $42=__lastLabel__ == 5 ? 0 : ($40);
        if ($42) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $43
        var $44=HEAP[$cu];
        var $45=(($44) + 1)&4294967295;
        HEAP[$cu]=$45;
        var $46=HEAP[$4];
        var $47=HEAP[$3];
        var $48=HEAP[$cu];
        var $49=HEAP[$2];
        var $50=($49)&4294967295;
        var $51=HEAP[$50];
        var $52=($51+4*$48)&4294967295;
        var $53=HEAP[$52];
        var $54=FUNCTION_TABLE[$46]($47, $53);
        HEAP[$ret]=$54;
        __label__ = 5; break;
      case 9: // $55
        var $56=HEAP[$cu];
        HEAP[$1]=$56;
        __label__ = 10; break;
      case 4: // $57
        var $58=HEAP[$ret];
        var $59=((($58))|0) < 0;
        if ($59) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $60
        var $61=HEAP[$cu];
        HEAP[$ma]=$61;
        __label__ = 13; break;
      case 12: // $62
        var $63=HEAP[$cu];
        HEAP[$mi]=$63;
        __label__ = 13; break;
      case 13: // $64
        __label__ = 14; break;
      case 14: // $65
        __label__ = 0; break;
      case 2: // $66
        var $67=HEAP[$ma];
        HEAP[$1]=$67;
        __label__ = 10; break;
      case 10: // $68
        var $69=HEAP[$1];
        STACKTOP = __stackBase__;
        return $69;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _parr_top($arr) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 8);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        HEAP[$2]=$arr;
        var $3=HEAP[$2];
        var $4=($3)==0;
        if ($4) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $5
        var $6=HEAP[$2];
        var $7=($6+4)&4294967295;
        var $8=HEAP[$7];
        var $9=((($8))|0) <= 0;
        if ($9) { __label__ = 0; break; } else { __label__ = 2; break; }
      case 0: // $10
        HEAP[$1]=0;
        __label__ = 3; break;
      case 2: // $11
        var $12=HEAP[$2];
        var $13=($12+4)&4294967295;
        var $14=HEAP[$13];
        var $15=(($14) - 1)&4294967295;
        var $16=HEAP[$2];
        var $17=($16)&4294967295;
        var $18=HEAP[$17];
        var $19=($18+4*$15)&4294967295;
        var $20=HEAP[$19];
        HEAP[$1]=$20;
        __label__ = 3; break;
      case 3: // $21
        var $22=HEAP[$1];
        STACKTOP = __stackBase__;
        return $22;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _bufcasecmp($a, $b) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 20);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $i=__stackBase__+12;
        var $cmplen=__stackBase__+16;
        HEAP[$2]=$a;
        HEAP[$3]=$b;
        HEAP[$i]=0;
        var $4=HEAP[$2];
        var $5=HEAP[$3];
        var $6=($4)==($5);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1]=0;
        __label__ = 2; break;
      case 1: // $8
        var $9=HEAP[$2];
        var $10=($9)!=0;
        if ($10) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 4: // $11
        HEAP[$1]=-1;
        __label__ = 2; break;
      case 3: // $12
        var $13=HEAP[$3];
        var $14=($13)!=0;
        if ($14) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 6: // $15
        HEAP[$1]=1;
        __label__ = 2; break;
      case 5: // $16
        __label__ = 7; break;
      case 7: // $17
        var $18=HEAP[$2];
        var $19=($18+4)&4294967295;
        var $20=HEAP[$19];
        var $21=HEAP[$3];
        var $22=($21+4)&4294967295;
        var $23=HEAP[$22];
        var $24=unSign(($20), 32, 0) < unSign(($23), 32, 0);
        if ($24) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $25
        var $26=HEAP[$2];
        var $27=($26+4)&4294967295;
        var $28=HEAP[$27];
        __lastLabel__ = 8; __label__ = 10; break;
      case 9: // $29
        var $30=HEAP[$3];
        var $31=($30+4)&4294967295;
        var $32=HEAP[$31];
        __lastLabel__ = 9; __label__ = 10; break;
      case 10: // $33
        var $34=__lastLabel__ == 8 ? $28 : ($32);
        HEAP[$cmplen]=$34;
        __label__ = 11; break;
      case 11: // $35
        var $36=HEAP[$i];
        var $37=HEAP[$cmplen];
        var $38=unSign(($36), 32, 0) < unSign(($37), 32, 0);
        if ($38) { __lastLabel__ = 11; __label__ = 12; break; } else { __lastLabel__ = 11; __label__ = 13; break; }
      case 12: // $39
        var $40=HEAP[$i];
        var $41=HEAP[$2];
        var $42=($41)&4294967295;
        var $43=HEAP[$42];
        var $44=($43+$40)&4294967295;
        var $45=HEAP[$44];
        var $46=_lower($45);
        var $47=reSign(($46), 8, 0);
        var $48=HEAP[$i];
        var $49=HEAP[$3];
        var $50=($49)&4294967295;
        var $51=HEAP[$50];
        var $52=($51+$48)&4294967295;
        var $53=HEAP[$52];
        var $54=_lower($53);
        var $55=reSign(($54), 8, 0);
        var $56=((($47))|0)==((($55))|0);
        __lastLabel__ = 12; __label__ = 13; break;
      case 13: // $57
        var $58=__lastLabel__ == 11 ? 0 : ($56);
        if ($58) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 14: // $59
        var $60=HEAP[$i];
        var $61=(($60) + 1)&4294967295;
        HEAP[$i]=$61;
        __label__ = 11; break;
      case 15: // $62
        var $63=HEAP[$i];
        var $64=HEAP[$2];
        var $65=($64+4)&4294967295;
        var $66=HEAP[$65];
        var $67=unSign(($63), 32, 0) < unSign(($66), 32, 0);
        if ($67) { __label__ = 16; break; } else { __label__ = 17; break; }
      case 16: // $68
        var $69=HEAP[$i];
        var $70=HEAP[$3];
        var $71=($70+4)&4294967295;
        var $72=HEAP[$71];
        var $73=unSign(($69), 32, 0) < unSign(($72), 32, 0);
        if ($73) { __label__ = 18; break; } else { __label__ = 19; break; }
      case 18: // $74
        var $75=HEAP[$i];
        var $76=HEAP[$2];
        var $77=($76)&4294967295;
        var $78=HEAP[$77];
        var $79=($78+$75)&4294967295;
        var $80=HEAP[$79];
        var $81=_lower($80);
        var $82=reSign(($81), 8, 0);
        var $83=HEAP[$i];
        var $84=HEAP[$3];
        var $85=($84)&4294967295;
        var $86=HEAP[$85];
        var $87=($86+$83)&4294967295;
        var $88=HEAP[$87];
        var $89=_lower($88);
        var $90=reSign(($89), 8, 0);
        var $91=(($82) - ($90))&4294967295;
        HEAP[$1]=$91;
        __label__ = 2; break;
      case 19: // $92
        HEAP[$1]=1;
        __label__ = 2; break;
      case 17: // $93
        var $94=HEAP[$i];
        var $95=HEAP[$3];
        var $96=($95+4)&4294967295;
        var $97=HEAP[$96];
        var $98=unSign(($94), 32, 0) < unSign(($97), 32, 0);
        if ($98) { __label__ = 20; break; } else { __label__ = 21; break; }
      case 20: // $99
        HEAP[$1]=-1;
        __label__ = 2; break;
      case 21: // $100
        HEAP[$1]=0;
        __label__ = 2; break;
      case 2: // $101
        var $102=HEAP[$1];
        STACKTOP = __stackBase__;
        return $102;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _lower($c) {
    var __stackBase__  = STACKTOP; STACKTOP += 1; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 1);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        HEAP[$1]=$c;
        var $2=HEAP[$1];
        var $3=reSign(($2), 8, 0);
        var $4=((($3))|0) >= 65;
        if ($4) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $5
        var $6=HEAP[$1];
        var $7=reSign(($6), 8, 0);
        var $8=((($7))|0) <= 90;
        if ($8) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 2: // $9
        var $10=HEAP[$1];
        var $11=reSign(($10), 8, 0);
        var $12=(($11) - 65)&4294967295;
        var $13=(($12) + 97)&4294967295;
        __lastLabel__ = 2; __label__ = 3; break;
      case 1: // $14
        var $15=HEAP[$1];
        var $16=reSign(($15), 8, 0);
        __lastLabel__ = 1; __label__ = 3; break;
      case 3: // $17
        var $18=__lastLabel__ == 2 ? $13 : ($16);
        var $19=((($18)) & 255);
        STACKTOP = __stackBase__;
        return $19;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _bufcmp($a, $b) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 20);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $i=__stackBase__+12;
        var $cmplen=__stackBase__+16;
        HEAP[$2]=$a;
        HEAP[$3]=$b;
        HEAP[$i]=0;
        var $4=HEAP[$2];
        var $5=HEAP[$3];
        var $6=($4)==($5);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1]=0;
        __label__ = 2; break;
      case 1: // $8
        var $9=HEAP[$2];
        var $10=($9)!=0;
        if ($10) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 4: // $11
        HEAP[$1]=-1;
        __label__ = 2; break;
      case 3: // $12
        var $13=HEAP[$3];
        var $14=($13)!=0;
        if ($14) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 6: // $15
        HEAP[$1]=1;
        __label__ = 2; break;
      case 5: // $16
        __label__ = 7; break;
      case 7: // $17
        var $18=HEAP[$2];
        var $19=($18+4)&4294967295;
        var $20=HEAP[$19];
        var $21=HEAP[$3];
        var $22=($21+4)&4294967295;
        var $23=HEAP[$22];
        var $24=unSign(($20), 32, 0) < unSign(($23), 32, 0);
        if ($24) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $25
        var $26=HEAP[$2];
        var $27=($26+4)&4294967295;
        var $28=HEAP[$27];
        __lastLabel__ = 8; __label__ = 10; break;
      case 9: // $29
        var $30=HEAP[$3];
        var $31=($30+4)&4294967295;
        var $32=HEAP[$31];
        __lastLabel__ = 9; __label__ = 10; break;
      case 10: // $33
        var $34=__lastLabel__ == 8 ? $28 : ($32);
        HEAP[$cmplen]=$34;
        __label__ = 11; break;
      case 11: // $35
        var $36=HEAP[$i];
        var $37=HEAP[$cmplen];
        var $38=unSign(($36), 32, 0) < unSign(($37), 32, 0);
        if ($38) { __lastLabel__ = 11; __label__ = 12; break; } else { __lastLabel__ = 11; __label__ = 13; break; }
      case 12: // $39
        var $40=HEAP[$i];
        var $41=HEAP[$2];
        var $42=($41)&4294967295;
        var $43=HEAP[$42];
        var $44=($43+$40)&4294967295;
        var $45=HEAP[$44];
        var $46=reSign(($45), 8, 0);
        var $47=HEAP[$i];
        var $48=HEAP[$3];
        var $49=($48)&4294967295;
        var $50=HEAP[$49];
        var $51=($50+$47)&4294967295;
        var $52=HEAP[$51];
        var $53=reSign(($52), 8, 0);
        var $54=((($46))|0)==((($53))|0);
        __lastLabel__ = 12; __label__ = 13; break;
      case 13: // $55
        var $56=__lastLabel__ == 11 ? 0 : ($54);
        if ($56) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 14: // $57
        var $58=HEAP[$i];
        var $59=(($58) + 1)&4294967295;
        HEAP[$i]=$59;
        __label__ = 11; break;
      case 15: // $60
        var $61=HEAP[$i];
        var $62=HEAP[$2];
        var $63=($62+4)&4294967295;
        var $64=HEAP[$63];
        var $65=unSign(($61), 32, 0) < unSign(($64), 32, 0);
        if ($65) { __label__ = 16; break; } else { __label__ = 17; break; }
      case 16: // $66
        var $67=HEAP[$i];
        var $68=HEAP[$3];
        var $69=($68+4)&4294967295;
        var $70=HEAP[$69];
        var $71=unSign(($67), 32, 0) < unSign(($70), 32, 0);
        if ($71) { __label__ = 18; break; } else { __label__ = 19; break; }
      case 18: // $72
        var $73=HEAP[$i];
        var $74=HEAP[$2];
        var $75=($74)&4294967295;
        var $76=HEAP[$75];
        var $77=($76+$73)&4294967295;
        var $78=HEAP[$77];
        var $79=reSign(($78), 8, 0);
        var $80=HEAP[$i];
        var $81=HEAP[$3];
        var $82=($81)&4294967295;
        var $83=HEAP[$82];
        var $84=($83+$80)&4294967295;
        var $85=HEAP[$84];
        var $86=reSign(($85), 8, 0);
        var $87=(($79) - ($86))&4294967295;
        HEAP[$1]=$87;
        __label__ = 2; break;
      case 19: // $88
        HEAP[$1]=1;
        __label__ = 2; break;
      case 17: // $89
        var $90=HEAP[$i];
        var $91=HEAP[$3];
        var $92=($91+4)&4294967295;
        var $93=HEAP[$92];
        var $94=unSign(($90), 32, 0) < unSign(($93), 32, 0);
        if ($94) { __label__ = 20; break; } else { __label__ = 21; break; }
      case 20: // $95
        HEAP[$1]=-1;
        __label__ = 2; break;
      case 21: // $96
        HEAP[$1]=0;
        __label__ = 2; break;
      case 2: // $97
        var $98=HEAP[$1];
        STACKTOP = __stackBase__;
        return $98;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _bufcmps($a, $b) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 24);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $len=__stackBase__+12;
        var $cmplen=__stackBase__+16;
        var $r=__stackBase__+20;
        HEAP[$2]=$a;
        HEAP[$3]=$b;
        var $4=HEAP[$3];
        var $5=_strlen($4);
        HEAP[$len]=$5;
        var $6=HEAP[$len];
        HEAP[$cmplen]=$6;
        var $7=HEAP[$2];
        var $8=($7)!=0;
        if ($8) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $9
        var $10=HEAP[$2];
        var $11=($10+4)&4294967295;
        var $12=HEAP[$11];
        var $13=((($12))|0)!=0;
        if ($13) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 1: // $14
        var $15=HEAP[$3];
        var $16=($15)!=0;
        if ($16) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $17
        __lastLabel__ = 3; __label__ = 5; break;
      case 4: // $18
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $19
        var $20=__lastLabel__ == 3 ? 0 : (-1);
        HEAP[$1]=$20;
        __label__ = 6; break;
      case 2: // $21
        var $22=HEAP[$len];
        var $23=HEAP[$2];
        var $24=($23+4)&4294967295;
        var $25=HEAP[$24];
        var $26=unSign(($22), 32, 0) < unSign(($25), 32, 0);
        if ($26) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $27
        var $28=HEAP[$2];
        var $29=($28+4)&4294967295;
        var $30=HEAP[$29];
        HEAP[$cmplen]=$30;
        __label__ = 8; break;
      case 8: // $31
        var $32=HEAP[$2];
        var $33=($32)&4294967295;
        var $34=HEAP[$33];
        var $35=HEAP[$3];
        var $36=HEAP[$cmplen];
        var $37=_strncmp($34, $35, $36);
        HEAP[$r]=$37;
        var $38=HEAP[$r];
        var $39=((($38))|0)!=0;
        if ($39) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $40
        var $41=HEAP[$r];
        HEAP[$1]=$41;
        __label__ = 6; break;
      case 10: // $42
        var $43=HEAP[$2];
        var $44=($43+4)&4294967295;
        var $45=HEAP[$44];
        var $46=HEAP[$len];
        var $47=((($45))|0)==((($46))|0);
        if ($47) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $48
        HEAP[$1]=0;
        __label__ = 6; break;
      case 12: // $49
        var $50=HEAP[$2];
        var $51=($50+4)&4294967295;
        var $52=HEAP[$51];
        var $53=HEAP[$len];
        var $54=unSign(($52), 32, 0) < unSign(($53), 32, 0);
        if ($54) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $55
        HEAP[$1]=-1;
        __label__ = 6; break;
      case 14: // $56
        HEAP[$1]=1;
        __label__ = 6; break;
      case 6: // $57
        var $58=HEAP[$1];
        STACKTOP = __stackBase__;
        return $58;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _bufprefix($buf, $prefix) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 16);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $i=__stackBase__+12;
        HEAP[$2]=$buf;
        HEAP[$3]=$prefix;
        HEAP[$i]=0;
        __label__ = 0; break;
      case 0: // $4
        var $5=HEAP[$i];
        var $6=HEAP[$2];
        var $7=($6+4)&4294967295;
        var $8=HEAP[$7];
        var $9=unSign(($5), 32, 0) < unSign(($8), 32, 0);
        if ($9) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $10
        var $11=HEAP[$i];
        var $12=HEAP[$3];
        var $13=($12+$11)&4294967295;
        var $14=HEAP[$13];
        var $15=reSign(($14), 8, 0);
        var $16=((($15))|0)==0;
        if ($16) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $17
        HEAP[$1]=0;
        __label__ = 5; break;
      case 4: // $18
        var $19=HEAP[$i];
        var $20=HEAP[$2];
        var $21=($20)&4294967295;
        var $22=HEAP[$21];
        var $23=($22+$19)&4294967295;
        var $24=HEAP[$23];
        var $25=reSign(($24), 8, 0);
        var $26=HEAP[$i];
        var $27=HEAP[$3];
        var $28=($27+$26)&4294967295;
        var $29=HEAP[$28];
        var $30=reSign(($29), 8, 0);
        var $31=((($25))|0)!=((($30))|0);
        if ($31) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $32
        var $33=HEAP[$i];
        var $34=HEAP[$2];
        var $35=($34)&4294967295;
        var $36=HEAP[$35];
        var $37=($36+$33)&4294967295;
        var $38=HEAP[$37];
        var $39=reSign(($38), 8, 0);
        var $40=HEAP[$i];
        var $41=HEAP[$3];
        var $42=($41+$40)&4294967295;
        var $43=HEAP[$42];
        var $44=reSign(($43), 8, 0);
        var $45=(($39) - ($44))&4294967295;
        HEAP[$1]=$45;
        __label__ = 5; break;
      case 7: // $46
        __label__ = 8; break;
      case 8: // $47
        var $48=HEAP[$i];
        var $49=(($48) + 1)&4294967295;
        HEAP[$i]=$49;
        __label__ = 0; break;
      case 2: // $50
        HEAP[$1]=0;
        __label__ = 5; break;
      case 5: // $51
        var $52=HEAP[$1];
        STACKTOP = __stackBase__;
        return $52;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _bufdup($src, $dupunit) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 20);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $blocks=__stackBase__+12;
        var $ret=__stackBase__+16;
        HEAP[$2]=$src;
        HEAP[$3]=$dupunit;
        var $4=HEAP[$2];
        var $5=($4)==0;
        if ($5) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $6
        HEAP[$1]=0;
        __label__ = 2; break;
      case 1: // $7
        var $8=_malloc(20);
        var $9=$8;
        HEAP[$ret]=$9;
        var $10=HEAP[$ret];
        var $11=($10)==0;
        if ($11) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $12
        HEAP[$1]=0;
        __label__ = 2; break;
      case 4: // $13
        var $14=HEAP[$3];
        var $15=HEAP[$ret];
        var $16=($15+12)&4294967295;
        HEAP[$16]=$14;
        var $17=HEAP[$2];
        var $18=($17+4)&4294967295;
        var $19=HEAP[$18];
        var $20=HEAP[$ret];
        var $21=($20+4)&4294967295;
        HEAP[$21]=$19;
        var $22=HEAP[$ret];
        var $23=($22+16)&4294967295;
        HEAP[$23]=1;
        var $24=HEAP[$2];
        var $25=($24+4)&4294967295;
        var $26=HEAP[$25];
        var $27=((($26))|0)!=0;
        if ($27) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 6: // $28
        var $29=HEAP[$ret];
        var $30=($29+8)&4294967295;
        HEAP[$30]=0;
        var $31=HEAP[$ret];
        var $32=($31)&4294967295;
        HEAP[$32]=0;
        var $33=HEAP[$ret];
        HEAP[$1]=$33;
        __label__ = 2; break;
      case 5: // $34
        var $35=HEAP[$2];
        var $36=($35+4)&4294967295;
        var $37=HEAP[$36];
        var $38=HEAP[$3];
        var $39=(($37) + ($38))&4294967295;
        var $40=(($39) - 1)&4294967295;
        var $41=HEAP[$3];
        var $42=Math.floor(unSign(($40), 32, 0)/unSign(($41), 32, 0));
        HEAP[$blocks]=$42;
        var $43=HEAP[$blocks];
        var $44=HEAP[$3];
        var $45=(($43) * ($44))&4294967295;
        var $46=HEAP[$ret];
        var $47=($46+8)&4294967295;
        HEAP[$47]=$45;
        var $48=HEAP[$ret];
        var $49=($48+8)&4294967295;
        var $50=HEAP[$49];
        var $51=_malloc($50);
        var $52=HEAP[$ret];
        var $53=($52)&4294967295;
        HEAP[$53]=$51;
        var $54=HEAP[$ret];
        var $55=($54)&4294967295;
        var $56=HEAP[$55];
        var $57=($56)==0;
        if ($57) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $58
        var $59=HEAP[$ret];
        var $60=$59;
        _free($60);
        HEAP[$1]=0;
        __label__ = 2; break;
      case 8: // $61
        var $62=HEAP[$ret];
        var $63=($62)&4294967295;
        var $64=HEAP[$63];
        var $65=HEAP[$2];
        var $66=($65)&4294967295;
        var $67=HEAP[$66];
        var $68=HEAP[$2];
        var $69=($68+4)&4294967295;
        var $70=HEAP[$69];
        _llvm_memcpy_p0i8_p0i8_i32($64, $67, $70, 1, 0);
        var $71=HEAP[$ret];
        HEAP[$1]=$71;
        __label__ = 2; break;
      case 2: // $72
        var $73=HEAP[$1];
        STACKTOP = __stackBase__;
        return $73;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _bufgrow($buf, $neosz) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 20);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $neoasz=__stackBase__+12;
        var $neodata=__stackBase__+16;
        HEAP[$2]=$buf;
        HEAP[$3]=$neosz;
        var $4=HEAP[$2];
        var $5=($4)!=0;
        if ($5) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $6
        var $7=HEAP[$2];
        var $8=($7+12)&4294967295;
        var $9=HEAP[$8];
        var $10=((($9))|0)!=0;
        if ($10) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 2: // $11
        var $12=HEAP[$3];
        var $13=unSign(($12), 32, 0) > 16777216;
        if ($13) { __label__ = 1; break; } else { __label__ = 3; break; }
      case 1: // $14
        HEAP[$1]=0;
        __label__ = 4; break;
      case 3: // $15
        var $16=HEAP[$2];
        var $17=($16+8)&4294967295;
        var $18=HEAP[$17];
        var $19=HEAP[$3];
        var $20=unSign(($18), 32, 0) >= unSign(($19), 32, 0);
        if ($20) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $21
        HEAP[$1]=1;
        __label__ = 4; break;
      case 6: // $22
        var $23=HEAP[$2];
        var $24=($23+8)&4294967295;
        var $25=HEAP[$24];
        var $26=HEAP[$2];
        var $27=($26+12)&4294967295;
        var $28=HEAP[$27];
        var $29=(($25) + ($28))&4294967295;
        HEAP[$neoasz]=$29;
        __label__ = 7; break;
      case 7: // $30
        var $31=HEAP[$neoasz];
        var $32=HEAP[$3];
        var $33=unSign(($31), 32, 0) < unSign(($32), 32, 0);
        if ($33) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $34
        var $35=HEAP[$2];
        var $36=($35+12)&4294967295;
        var $37=HEAP[$36];
        var $38=HEAP[$neoasz];
        var $39=(($38) + ($37))&4294967295;
        HEAP[$neoasz]=$39;
        __label__ = 7; break;
      case 9: // $40
        var $41=HEAP[$2];
        var $42=($41)&4294967295;
        var $43=HEAP[$42];
        var $44=HEAP[$neoasz];
        var $45=_realloc($43, $44);
        HEAP[$neodata]=$45;
        var $46=HEAP[$neodata];
        var $47=($46)!=0;
        if ($47) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 11: // $48
        HEAP[$1]=0;
        __label__ = 4; break;
      case 10: // $49
        var $50=HEAP[$neodata];
        var $51=HEAP[$2];
        var $52=($51)&4294967295;
        HEAP[$52]=$50;
        var $53=HEAP[$neoasz];
        var $54=HEAP[$2];
        var $55=($54+8)&4294967295;
        HEAP[$55]=$53;
        HEAP[$1]=1;
        __label__ = 4; break;
      case 4: // $56
        var $57=HEAP[$1];
        STACKTOP = __stackBase__;
        return $57;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _bufnew($unit) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 8);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $ret=__stackBase__+4;
        HEAP[$1]=$unit;
        var $2=_malloc(20);
        var $3=$2;
        HEAP[$ret]=$3;
        var $4=HEAP[$ret];
        var $5=($4)!=0;
        if ($5) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $6
        var $7=HEAP[$ret];
        var $8=($7)&4294967295;
        HEAP[$8]=0;
        var $9=HEAP[$ret];
        var $10=($9+8)&4294967295;
        HEAP[$10]=0;
        var $11=HEAP[$ret];
        var $12=($11+4)&4294967295;
        HEAP[$12]=0;
        var $13=HEAP[$ret];
        var $14=($13+16)&4294967295;
        HEAP[$14]=1;
        var $15=HEAP[$1];
        var $16=HEAP[$ret];
        var $17=($16+12)&4294967295;
        HEAP[$17]=$15;
        __label__ = 1; break;
      case 1: // $18
        var $19=HEAP[$ret];
        STACKTOP = __stackBase__;
        return $19;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _bufnullterm($buf) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 4);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        HEAP[$1]=$buf;
        var $2=HEAP[$1];
        var $3=($2)!=0;
        if ($3) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $4
        var $5=HEAP[$1];
        var $6=($5+12)&4294967295;
        var $7=HEAP[$6];
        var $8=((($7))|0)!=0;
        if ($8) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 1: // $9
        __label__ = 3; break;
      case 2: // $10
        var $11=HEAP[$1];
        var $12=($11+4)&4294967295;
        var $13=HEAP[$12];
        var $14=HEAP[$1];
        var $15=($14+8)&4294967295;
        var $16=HEAP[$15];
        var $17=unSign(($13), 32, 0) < unSign(($16), 32, 0);
        if ($17) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $18
        var $19=HEAP[$1];
        var $20=($19+4)&4294967295;
        var $21=HEAP[$20];
        var $22=HEAP[$1];
        var $23=($22)&4294967295;
        var $24=HEAP[$23];
        var $25=($24+$21)&4294967295;
        var $26=HEAP[$25];
        var $27=reSign(($26), 8, 0);
        var $28=((($27))|0)==0;
        if ($28) { __label__ = 6; break; } else { __label__ = 5; break; }
      case 6: // $29
        __label__ = 3; break;
      case 5: // $30
        var $31=HEAP[$1];
        var $32=HEAP[$1];
        var $33=($32+4)&4294967295;
        var $34=HEAP[$33];
        var $35=(($34) + 1)&4294967295;
        var $36=_bufgrow($31, $35);
        var $37=((($36))|0)!=0;
        if ($37) { __label__ = 7; break; } else { __label__ = 3; break; }
      case 7: // $38
        var $39=HEAP[$1];
        var $40=($39+4)&4294967295;
        var $41=HEAP[$40];
        var $42=HEAP[$1];
        var $43=($42)&4294967295;
        var $44=HEAP[$43];
        var $45=($44+$41)&4294967295;
        HEAP[$45]=0;
        __label__ = 3; break;
      case 3: // $46
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _bufprintf($buf, $fmt) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 12);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $ap=__stackBase__+8;
        HEAP[$1]=$buf;
        HEAP[$2]=$fmt;
        var $3=HEAP[$1];
        var $4=($3)!=0;
        if ($4) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $5
        var $6=HEAP[$1];
        var $7=($6+12)&4294967295;
        var $8=HEAP[$7];
        var $9=((($8))|0)!=0;
        if ($9) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 1: // $10
        __label__ = 3; break;
      case 2: // $11
        var $12=$ap;
        IHEAP[$12] = arguments[_bufprintf.length];
        var $13=HEAP[$1];
        var $14=HEAP[$2];
        var $15=HEAP[$ap];
        _vbufprintf($13, $14, $15);
        var $16=$ap;
        ;;
        __label__ = 3; break;
      case 3: // $17
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _vbufprintf($buf, $fmt, $ap) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 24);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $n=__stackBase__+12;
        var $ap_save=__stackBase__+16;
        var $new_size=__stackBase__+20;
        HEAP[$1]=$buf;
        HEAP[$2]=$fmt;
        HEAP[$3]=$ap;
        var $4=HEAP[$1];
        var $5=($4)==0;
        if ($5) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $6
        var $7=HEAP[$1];
        var $8=($7+4)&4294967295;
        var $9=HEAP[$8];
        var $10=HEAP[$1];
        var $11=($10+8)&4294967295;
        var $12=HEAP[$11];
        var $13=unSign(($9), 32, 0) >= unSign(($12), 32, 0);
        if ($13) { __label__ = 2; break; } else { __label__ = 3; break; }
      case 2: // $14
        var $15=HEAP[$1];
        var $16=HEAP[$1];
        var $17=($16+4)&4294967295;
        var $18=HEAP[$17];
        var $19=(($18) + 1)&4294967295;
        var $20=_bufgrow($15, $19);
        var $21=((($20))|0)!=0;
        if ($21) { __label__ = 3; break; } else { __label__ = 0; break; }
      case 0: // $22
        __label__ = 4; break;
      case 3: // $23
        var $24=$ap_save;
        var $25=$3;
        _llvm_va_copy($24, $25);
        var $26=HEAP[$1];
        var $27=($26)&4294967295;
        var $28=HEAP[$27];
        var $29=HEAP[$1];
        var $30=($29+4)&4294967295;
        var $31=HEAP[$30];
        var $32=($28+$31)&4294967295;
        var $33=HEAP[$1];
        var $34=($33+8)&4294967295;
        var $35=HEAP[$34];
        var $36=HEAP[$1];
        var $37=($36+4)&4294967295;
        var $38=HEAP[$37];
        var $39=(($35) - ($38))&4294967295;
        var $40=HEAP[$2];
        var $41=HEAP[$3];
        var $42=_vsnprintf($32, $39, $40, $41);
        HEAP[$n]=$42;
        var $43=HEAP[$n];
        var $44=((($43))|0) < 0;
        if ($44) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 6: // $45
        var $46=HEAP[$n];
        var $47=HEAP[$1];
        var $48=($47+8)&4294967295;
        var $49=HEAP[$48];
        var $50=HEAP[$1];
        var $51=($50+4)&4294967295;
        var $52=HEAP[$51];
        var $53=(($49) - ($52))&4294967295;
        var $54=unSign(($46), 32, 0) >= unSign(($53), 32, 0);
        if ($54) { __label__ = 5; break; } else { __label__ = 7; break; }
      case 5: // $55
        var $56=HEAP[$n];
        var $57=((($56))|0) > 0;
        if ($57) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $58
        var $59=HEAP[$n];
        __lastLabel__ = 8; __label__ = 10; break;
      case 9: // $60
        var $61=HEAP[$1];
        var $62=($61+4)&4294967295;
        var $63=HEAP[$62];
        __lastLabel__ = 9; __label__ = 10; break;
      case 10: // $64
        var $65=__lastLabel__ == 8 ? $59 : ($63);
        HEAP[$new_size]=$65;
        var $66=HEAP[$1];
        var $67=HEAP[$1];
        var $68=($67+4)&4294967295;
        var $69=HEAP[$68];
        var $70=HEAP[$new_size];
        var $71=(($69) + ($70))&4294967295;
        var $72=(($71) + 1)&4294967295;
        var $73=_bufgrow($66, $72);
        var $74=((($73))|0)!=0;
        if ($74) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 12: // $75
        __label__ = 4; break;
      case 11: // $76
        var $77=HEAP[$1];
        var $78=($77)&4294967295;
        var $79=HEAP[$78];
        var $80=HEAP[$1];
        var $81=($80+4)&4294967295;
        var $82=HEAP[$81];
        var $83=($79+$82)&4294967295;
        var $84=HEAP[$1];
        var $85=($84+8)&4294967295;
        var $86=HEAP[$85];
        var $87=HEAP[$1];
        var $88=($87+4)&4294967295;
        var $89=HEAP[$88];
        var $90=(($86) - ($89))&4294967295;
        var $91=HEAP[$2];
        var $92=HEAP[$ap_save];
        var $93=_vsnprintf($83, $90, $91, $92);
        HEAP[$n]=$93;
        __label__ = 7; break;
      case 7: // $94
        var $95=$ap_save;
        ;;
        var $96=HEAP[$n];
        var $97=((($96))|0) < 0;
        if ($97) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $98
        __label__ = 4; break;
      case 14: // $99
        var $100=HEAP[$n];
        var $101=HEAP[$1];
        var $102=($101+4)&4294967295;
        var $103=HEAP[$102];
        var $104=(($103) + ($100))&4294967295;
        HEAP[$102]=$104;
        __label__ = 4; break;
      case 4: // $105
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _bufput($buf, $data, $len) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 12);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        HEAP[$1]=$buf;
        HEAP[$2]=$data;
        HEAP[$3]=$len;
        var $4=HEAP[$1];
        var $5=($4)!=0;
        if ($5) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $6
        var $7=HEAP[$1];
        var $8=HEAP[$1];
        var $9=($8+4)&4294967295;
        var $10=HEAP[$9];
        var $11=HEAP[$3];
        var $12=(($10) + ($11))&4294967295;
        var $13=_bufgrow($7, $12);
        var $14=((($13))|0)!=0;
        if ($14) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 1: // $15
        __label__ = 3; break;
      case 2: // $16
        var $17=HEAP[$1];
        var $18=($17)&4294967295;
        var $19=HEAP[$18];
        var $20=HEAP[$1];
        var $21=($20+4)&4294967295;
        var $22=HEAP[$21];
        var $23=($19+$22)&4294967295;
        var $24=HEAP[$2];
        var $25=HEAP[$3];
        _llvm_memcpy_p0i8_p0i8_i32($23, $24, $25, 1, 0);
        var $26=HEAP[$3];
        var $27=HEAP[$1];
        var $28=($27+4)&4294967295;
        var $29=HEAP[$28];
        var $30=(($29) + ($26))&4294967295;
        HEAP[$28]=$30;
        __label__ = 3; break;
      case 3: // $31
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _bufputs($buf, $str) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 8);
    var __label__;
  
    var $1=__stackBase__;
    var $2=__stackBase__+4;
    HEAP[$1]=$buf;
    HEAP[$2]=$str;
    var $3=HEAP[$1];
    var $4=HEAP[$2];
    var $5=HEAP[$2];
    var $6=_strlen($5);
    _bufput($3, $4, $6);
    STACKTOP = __stackBase__;
    return;
  }
  

  function _bufputc($buf, $c) {
    var __stackBase__  = STACKTOP; STACKTOP += 5; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 5);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        HEAP[$1]=$buf;
        HEAP[$2]=$c;
        var $3=HEAP[$1];
        var $4=($3)!=0;
        if ($4) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $5
        var $6=HEAP[$1];
        var $7=HEAP[$1];
        var $8=($7+4)&4294967295;
        var $9=HEAP[$8];
        var $10=(($9) + 1)&4294967295;
        var $11=_bufgrow($6, $10);
        var $12=((($11))|0)!=0;
        if ($12) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 1: // $13
        __label__ = 3; break;
      case 2: // $14
        var $15=HEAP[$2];
        var $16=HEAP[$1];
        var $17=($16+4)&4294967295;
        var $18=HEAP[$17];
        var $19=HEAP[$1];
        var $20=($19)&4294967295;
        var $21=HEAP[$20];
        var $22=($21+$18)&4294967295;
        HEAP[$22]=$15;
        var $23=HEAP[$1];
        var $24=($23+4)&4294967295;
        var $25=HEAP[$24];
        var $26=(($25) + 1)&4294967295;
        HEAP[$24]=$26;
        __label__ = 3; break;
      case 3: // $27
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _bufrelease($buf) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 4);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        HEAP[$1]=$buf;
        var $2=HEAP[$1];
        var $3=($2)!=0;
        if ($3) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $4
        var $5=HEAP[$1];
        var $6=($5+12)&4294967295;
        var $7=HEAP[$6];
        var $8=((($7))|0)!=0;
        if ($8) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 2: // $9
        var $10=HEAP[$1];
        var $11=($10+8)&4294967295;
        var $12=HEAP[$11];
        var $13=((($12))|0)!=0;
        if ($13) { __label__ = 3; break; } else { __label__ = 1; break; }
      case 1: // $14
        __label__ = 4; break;
      case 3: // $15
        var $16=HEAP[$1];
        var $17=($16+16)&4294967295;
        var $18=HEAP[$17];
        var $19=(($18) - 1)&4294967295;
        HEAP[$17]=$19;
        var $20=HEAP[$1];
        var $21=($20+16)&4294967295;
        var $22=HEAP[$21];
        var $23=((($22))|0)==0;
        if ($23) { __label__ = 5; break; } else { __label__ = 4; break; }
      case 5: // $24
        var $25=HEAP[$1];
        var $26=($25)&4294967295;
        var $27=HEAP[$26];
        _free($27);
        var $28=HEAP[$1];
        var $29=$28;
        _free($29);
        __label__ = 4; break;
      case 4: // $30
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _bufreset($buf) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 4);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        HEAP[$1]=$buf;
        var $2=HEAP[$1];
        var $3=($2)!=0;
        if ($3) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $4
        var $5=HEAP[$1];
        var $6=($5+12)&4294967295;
        var $7=HEAP[$6];
        var $8=((($7))|0)!=0;
        if ($8) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 2: // $9
        var $10=HEAP[$1];
        var $11=($10+8)&4294967295;
        var $12=HEAP[$11];
        var $13=((($12))|0)!=0;
        if ($13) { __label__ = 3; break; } else { __label__ = 1; break; }
      case 1: // $14
        __label__ = 4; break;
      case 3: // $15
        var $16=HEAP[$1];
        var $17=($16)&4294967295;
        var $18=HEAP[$17];
        _free($18);
        var $19=HEAP[$1];
        var $20=($19)&4294967295;
        HEAP[$20]=0;
        var $21=HEAP[$1];
        var $22=($21+8)&4294967295;
        HEAP[$22]=0;
        var $23=HEAP[$1];
        var $24=($23+4)&4294967295;
        HEAP[$24]=0;
        __label__ = 4; break;
      case 4: // $25
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _bufset($dest, $src) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 8);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        HEAP[$1]=$dest;
        HEAP[$2]=$src;
        var $3=HEAP[$2];
        var $4=($3)!=0;
        if ($4) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $5
        var $6=HEAP[$2];
        var $7=($6+8)&4294967295;
        var $8=HEAP[$7];
        var $9=((($8))|0)!=0;
        if ($9) { __label__ = 2; break; } else { __label__ = 3; break; }
      case 3: // $10
        var $11=HEAP[$2];
        var $12=_bufdup($11, 1);
        HEAP[$2]=$12;
        __label__ = 4; break;
      case 2: // $13
        var $14=HEAP[$2];
        var $15=($14+16)&4294967295;
        var $16=HEAP[$15];
        var $17=(($16) + 1)&4294967295;
        HEAP[$15]=$17;
        __label__ = 4; break;
      case 4: // $18
        __label__ = 1; break;
      case 1: // $19
        var $20=HEAP[$1];
        var $21=HEAP[$20];
        _bufrelease($21);
        var $22=HEAP[$2];
        var $23=HEAP[$1];
        HEAP[$23]=$22;
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _bufslurp($buf, $len) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 8);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        HEAP[$1]=$buf;
        HEAP[$2]=$len;
        var $3=HEAP[$1];
        var $4=($3)!=0;
        if ($4) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $5
        var $6=HEAP[$1];
        var $7=($6+12)&4294967295;
        var $8=HEAP[$7];
        var $9=((($8))|0)!=0;
        if ($9) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 2: // $10
        var $11=HEAP[$2];
        var $12=unSign(($11), 32, 0) <= 0;
        if ($12) { __label__ = 1; break; } else { __label__ = 3; break; }
      case 1: // $13
        __label__ = 4; break;
      case 3: // $14
        var $15=HEAP[$2];
        var $16=HEAP[$1];
        var $17=($16+4)&4294967295;
        var $18=HEAP[$17];
        var $19=unSign(($15), 32, 0) >= unSign(($18), 32, 0);
        if ($19) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $20
        var $21=HEAP[$1];
        var $22=($21+4)&4294967295;
        HEAP[$22]=0;
        __label__ = 4; break;
      case 6: // $23
        var $24=HEAP[$2];
        var $25=HEAP[$1];
        var $26=($25+4)&4294967295;
        var $27=HEAP[$26];
        var $28=(($27) - ($24))&4294967295;
        HEAP[$26]=$28;
        var $29=HEAP[$1];
        var $30=($29)&4294967295;
        var $31=HEAP[$30];
        var $32=HEAP[$1];
        var $33=($32)&4294967295;
        var $34=HEAP[$33];
        var $35=HEAP[$2];
        var $36=($34+$35)&4294967295;
        var $37=HEAP[$1];
        var $38=($37+4)&4294967295;
        var $39=HEAP[$38];
        _llvm_memmove_p0i8_p0i8_i32($31, $36, $39, 1, 0);
        __label__ = 4; break;
      case 4: // $40
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _buftoi($buf, $offset_i, $offset_o) {
    var __stackBase__  = STACKTOP; STACKTOP += 28; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 28);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $r=__stackBase__+16;
        var $neg=__stackBase__+20;
        var $i=__stackBase__+24;
        HEAP[$2]=$buf;
        HEAP[$3]=$offset_i;
        HEAP[$4]=$offset_o;
        HEAP[$r]=0;
        HEAP[$neg]=0;
        var $5=HEAP[$3];
        HEAP[$i]=$5;
        var $6=HEAP[$2];
        var $7=($6)!=0;
        if ($7) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $8
        var $9=HEAP[$2];
        var $10=($9+4)&4294967295;
        var $11=HEAP[$10];
        var $12=((($11))|0)!=0;
        if ($12) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 1: // $13
        HEAP[$1]=0;
        __label__ = 3; break;
      case 2: // $14
        var $15=HEAP[$i];
        var $16=HEAP[$2];
        var $17=($16)&4294967295;
        var $18=HEAP[$17];
        var $19=($18+$15)&4294967295;
        var $20=HEAP[$19];
        var $21=reSign(($20), 8, 0);
        var $22=((($21))|0)==43;
        if ($22) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $23
        var $24=HEAP[$i];
        var $25=(($24) + 1)&4294967295;
        HEAP[$i]=$25;
        __label__ = 6; break;
      case 5: // $26
        var $27=HEAP[$i];
        var $28=HEAP[$2];
        var $29=($28)&4294967295;
        var $30=HEAP[$29];
        var $31=($30+$27)&4294967295;
        var $32=HEAP[$31];
        var $33=reSign(($32), 8, 0);
        var $34=((($33))|0)==45;
        if ($34) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $35
        HEAP[$neg]=1;
        var $36=HEAP[$i];
        var $37=(($36) + 1)&4294967295;
        HEAP[$i]=$37;
        __label__ = 8; break;
      case 8: // $38
        __label__ = 6; break;
      case 6: // $39
        __label__ = 9; break;
      case 9: // $40
        var $41=HEAP[$i];
        var $42=HEAP[$2];
        var $43=($42+4)&4294967295;
        var $44=HEAP[$43];
        var $45=unSign(($41), 32, 0) < unSign(($44), 32, 0);
        if ($45) { __lastLabel__ = 9; __label__ = 10; break; } else { __lastLabel__ = 9; __label__ = 11; break; }
      case 10: // $46
        var $47=HEAP[$i];
        var $48=HEAP[$2];
        var $49=($48)&4294967295;
        var $50=HEAP[$49];
        var $51=($50+$47)&4294967295;
        var $52=HEAP[$51];
        var $53=reSign(($52), 8, 0);
        var $54=((($53))|0) >= 48;
        if ($54) { __lastLabel__ = 10; __label__ = 12; break; } else { __lastLabel__ = 10; __label__ = 11; break; }
      case 12: // $55
        var $56=HEAP[$i];
        var $57=HEAP[$2];
        var $58=($57)&4294967295;
        var $59=HEAP[$58];
        var $60=($59+$56)&4294967295;
        var $61=HEAP[$60];
        var $62=reSign(($61), 8, 0);
        var $63=((($62))|0) <= 57;
        __lastLabel__ = 12; __label__ = 11; break;
      case 11: // $64
        var $65=__lastLabel__ == 10 ? 0 : (__lastLabel__ == 9 ? 0 : ($63));
        if ($65) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $66
        var $67=HEAP[$r];
        var $68=(($67) * 10)&4294967295;
        var $69=HEAP[$i];
        var $70=HEAP[$2];
        var $71=($70)&4294967295;
        var $72=HEAP[$71];
        var $73=($72+$69)&4294967295;
        var $74=HEAP[$73];
        var $75=reSign(($74), 8, 0);
        var $76=(($68) + ($75))&4294967295;
        var $77=(($76) - 48)&4294967295;
        HEAP[$r]=$77;
        var $78=HEAP[$i];
        var $79=(($78) + 1)&4294967295;
        HEAP[$i]=$79;
        __label__ = 9; break;
      case 14: // $80
        var $81=HEAP[$4];
        var $82=($81)!=0;
        if ($82) { __label__ = 15; break; } else { __label__ = 16; break; }
      case 15: // $83
        var $84=HEAP[$i];
        var $85=HEAP[$4];
        HEAP[$85]=$84;
        __label__ = 16; break;
      case 16: // $86
        var $87=HEAP[$neg];
        var $88=((($87))|0)!=0;
        if ($88) { __label__ = 17; break; } else { __label__ = 18; break; }
      case 17: // $89
        var $90=HEAP[$r];
        var $91=(0 - ($90))&4294967295;
        __lastLabel__ = 17; __label__ = 19; break;
      case 18: // $92
        var $93=HEAP[$r];
        __lastLabel__ = 18; __label__ = 19; break;
      case 19: // $94
        var $95=__lastLabel__ == 17 ? $91 : ($93);
        HEAP[$1]=$95;
        __label__ = 3; break;
      case 3: // $96
        var $97=HEAP[$1];
        STACKTOP = __stackBase__;
        return $97;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _ups_toc_renderer($renderer) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 8);
    var __label__;
  
    var $1=__stackBase__;
    var $options=__stackBase__+4;
    HEAP[$1]=$renderer;
    var $2=_calloc(1, 12);
    var $3=$2;
    HEAP[$options]=$3;
    var $4=HEAP[$options];
    var $5=($4+8)&4294967295;
    HEAP[$5]=256;
    var $6=HEAP[$1];
    var $7=$6;
    _llvm_memcpy_p0i8_p0i8_i32($7, _ups_toc_renderer_toc_render, 100, 1, 0);
    var $8=HEAP[$options];
    var $9=$8;
    var $10=HEAP[$1];
    var $11=($10+96)&4294967295;
    HEAP[$11]=$9;
    STACKTOP = __stackBase__;
    return;
  }
  

  function _toc_header($ob, $text, $level, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 20);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $options=__stackBase__+16;
        HEAP[$1]=$ob;
        HEAP[$2]=$text;
        HEAP[$3]=$level;
        HEAP[$4]=$opaque;
        var $5=HEAP[$4];
        var $6=$5;
        HEAP[$options]=$6;
        var $7=HEAP[$3];
        var $8=HEAP[$options];
        var $9=($8)&4294967295;
        var $10=($9+4)&4294967295;
        var $11=HEAP[$10];
        var $12=((($7))|0) > ((($11))|0);
        if ($12) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $13
        var $14=HEAP[$3];
        var $15=((($14))|0) > 1;
        if ($15) { __label__ = 2; break; } else { __label__ = 3; break; }
      case 2: // $16
        var $17=HEAP[$1];
        _bufput($17, (__str60)&4294967295, 4);
        __label__ = 3; break;
      case 3: // $18
        var $19=HEAP[$1];
        _bufput($19, (__str63)&4294967295, 5);
        __label__ = 1; break;
      case 1: // $20
        var $21=HEAP[$3];
        var $22=HEAP[$options];
        var $23=($22)&4294967295;
        var $24=($23+4)&4294967295;
        var $25=HEAP[$24];
        var $26=((($21))|0) < ((($25))|0);
        if ($26) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $27
        var $28=HEAP[$1];
        _bufput($28, (__str87)&4294967295, 5);
        var $29=HEAP[$options];
        var $30=($29)&4294967295;
        var $31=($30+4)&4294967295;
        var $32=HEAP[$31];
        var $33=((($32))|0) > 1;
        if ($33) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $34
        var $35=HEAP[$1];
        _bufput($35, (__str61)&4294967295, 6);
        __label__ = 7; break;
      case 7: // $36
        __label__ = 5; break;
      case 5: // $37
        var $38=HEAP[$3];
        var $39=HEAP[$options];
        var $40=($39)&4294967295;
        var $41=($40+4)&4294967295;
        HEAP[$41]=$38;
        var $42=HEAP[$1];
        var $43=HEAP[$options];
        var $44=($43)&4294967295;
        var $45=($44)&4294967295;
        var $46=HEAP[$45];
        var $47=(($46) + 1)&4294967295;
        HEAP[$45]=$47;
        _bufprintf($42, (__str88)&4294967295, Pointer_make([$46,0,0,0], 0, ALLOC_STACK));
        var $48=HEAP[$2];
        var $49=($48)!=0;
        if ($49) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $50
        var $51=HEAP[$1];
        var $52=HEAP[$2];
        var $53=($52)&4294967295;
        var $54=HEAP[$53];
        var $55=HEAP[$2];
        var $56=($55+4)&4294967295;
        var $57=HEAP[$56];
        _bufput($51, $54, $57);
        __label__ = 9; break;
      case 9: // $58
        var $59=HEAP[$1];
        _bufput($59, (__str89)&4294967295, 10);
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_codespan($ob, $text, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 12);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        HEAP[$1]=$ob;
        HEAP[$2]=$text;
        HEAP[$3]=$opaque;
        var $4=HEAP[$1];
        _bufput($4, (__str85)&4294967295, 6);
        var $5=HEAP[$2];
        var $6=($5)!=0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        var $8=HEAP[$1];
        var $9=HEAP[$2];
        var $10=($9)&4294967295;
        var $11=HEAP[$10];
        var $12=HEAP[$2];
        var $13=($12+4)&4294967295;
        var $14=HEAP[$13];
        _lus_attr_escape($8, $11, $14);
        __label__ = 1; break;
      case 1: // $15
        var $16=HEAP[$1];
        _bufput($16, (__str86)&4294967295, 7);
        STACKTOP = __stackBase__;
        return 1;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_double_emphasis($ob, $text, $c, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 17; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 17);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+13;
        HEAP[$2]=$ob;
        HEAP[$3]=$text;
        HEAP[$4]=$c;
        HEAP[$5]=$opaque;
        var $6=HEAP[$3];
        var $7=($6)!=0;
        if ($7) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $8
        var $9=HEAP[$3];
        var $10=($9+4)&4294967295;
        var $11=HEAP[$10];
        var $12=((($11))|0)!=0;
        if ($12) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 1: // $13
        HEAP[$1]=0;
        __label__ = 3; break;
      case 2: // $14
        var $15=HEAP[$4];
        var $16=reSign(($15), 8, 0);
        var $17=((($16))|0)==126;
        if ($17) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $18
        var $19=HEAP[$2];
        _bufput($19, (__str81)&4294967295, 5);
        var $20=HEAP[$2];
        var $21=HEAP[$3];
        var $22=($21)&4294967295;
        var $23=HEAP[$22];
        var $24=HEAP[$3];
        var $25=($24+4)&4294967295;
        var $26=HEAP[$25];
        _bufput($20, $23, $26);
        var $27=HEAP[$2];
        _bufput($27, (__str82)&4294967295, 6);
        __label__ = 6; break;
      case 5: // $28
        var $29=HEAP[$2];
        _bufput($29, (__str83)&4294967295, 8);
        var $30=HEAP[$2];
        var $31=HEAP[$3];
        var $32=($31)&4294967295;
        var $33=HEAP[$32];
        var $34=HEAP[$3];
        var $35=($34+4)&4294967295;
        var $36=HEAP[$35];
        _bufput($30, $33, $36);
        var $37=HEAP[$2];
        _bufput($37, (__str84)&4294967295, 9);
        __label__ = 6; break;
      case 6: // $38
        HEAP[$1]=1;
        __label__ = 3; break;
      case 3: // $39
        var $40=HEAP[$1];
        STACKTOP = __stackBase__;
        return $40;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_emphasis($ob, $text, $c, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 17; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 17);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+13;
        HEAP[$2]=$ob;
        HEAP[$3]=$text;
        HEAP[$4]=$c;
        HEAP[$5]=$opaque;
        var $6=HEAP[$3];
        var $7=($6)!=0;
        if ($7) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $8
        var $9=HEAP[$3];
        var $10=($9+4)&4294967295;
        var $11=HEAP[$10];
        var $12=((($11))|0)!=0;
        if ($12) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 2: // $13
        var $14=HEAP[$4];
        var $15=reSign(($14), 8, 0);
        var $16=((($15))|0)==126;
        if ($16) { __label__ = 1; break; } else { __label__ = 3; break; }
      case 1: // $17
        HEAP[$1]=0;
        __label__ = 4; break;
      case 3: // $18
        var $19=HEAP[$2];
        _bufput($19, (__str79)&4294967295, 4);
        var $20=HEAP[$3];
        var $21=($20)!=0;
        if ($21) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $22
        var $23=HEAP[$2];
        var $24=HEAP[$3];
        var $25=($24)&4294967295;
        var $26=HEAP[$25];
        var $27=HEAP[$3];
        var $28=($27+4)&4294967295;
        var $29=HEAP[$28];
        _bufput($23, $26, $29);
        __label__ = 6; break;
      case 6: // $30
        var $31=HEAP[$2];
        _bufput($31, (__str80)&4294967295, 5);
        HEAP[$1]=1;
        __label__ = 4; break;
      case 4: // $32
        var $33=HEAP[$1];
        STACKTOP = __stackBase__;
        return $33;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_triple_emphasis($ob, $text, $c, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 17; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 17);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+13;
        HEAP[$2]=$ob;
        HEAP[$3]=$text;
        HEAP[$4]=$c;
        HEAP[$5]=$opaque;
        var $6=HEAP[$3];
        var $7=($6)!=0;
        if ($7) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $8
        var $9=HEAP[$3];
        var $10=($9+4)&4294967295;
        var $11=HEAP[$10];
        var $12=((($11))|0)!=0;
        if ($12) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 1: // $13
        HEAP[$1]=0;
        __label__ = 3; break;
      case 2: // $14
        var $15=HEAP[$2];
        _bufput($15, (__str77)&4294967295, 12);
        var $16=HEAP[$2];
        var $17=HEAP[$3];
        var $18=($17)&4294967295;
        var $19=HEAP[$18];
        var $20=HEAP[$3];
        var $21=($20+4)&4294967295;
        var $22=HEAP[$21];
        _bufput($16, $19, $22);
        var $23=HEAP[$2];
        _bufput($23, (__str78)&4294967295, 14);
        HEAP[$1]=1;
        __label__ = 3; break;
      case 3: // $24
        var $25=HEAP[$1];
        STACKTOP = __stackBase__;
        return $25;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _toc_finalize($ob, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 12);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $options=__stackBase__+8;
        HEAP[$1]=$ob;
        HEAP[$2]=$opaque;
        var $3=HEAP[$2];
        var $4=$3;
        HEAP[$options]=$4;
        __label__ = 0; break;
      case 0: // $5
        var $6=HEAP[$options];
        var $7=($6)&4294967295;
        var $8=($7+4)&4294967295;
        var $9=HEAP[$8];
        var $10=((($9))|0) > 1;
        if ($10) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $11
        var $12=HEAP[$1];
        _bufput($12, (__str76)&4294967295, 11);
        var $13=HEAP[$options];
        var $14=($13)&4294967295;
        var $15=($14+4)&4294967295;
        var $16=HEAP[$15];
        var $17=(($16) + -1)&4294967295;
        HEAP[$15]=$17;
        __label__ = 0; break;
      case 2: // $18
        var $19=HEAP[$options];
        var $20=($19)&4294967295;
        var $21=($20+4)&4294967295;
        var $22=HEAP[$21];
        var $23=((($22))|0)!=0;
        if ($23) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $24
        var $25=HEAP[$1];
        _bufput($25, (__str65)&4294967295, 6);
        __label__ = 4; break;
      case 4: // $26
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _ups_xhtml_renderer($renderer, $render_flags) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 12);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $options=__stackBase__+8;
        HEAP[$1]=$renderer;
        HEAP[$2]=$render_flags;
        var $3=_calloc(1, 12);
        var $4=$3;
        HEAP[$options]=$4;
        var $5=HEAP[$2];
        var $6=HEAP[$options];
        var $7=($6+8)&4294967295;
        HEAP[$7]=$5;
        var $8=HEAP[$1];
        var $9=$8;
        _llvm_memcpy_p0i8_p0i8_i32($9, _ups_xhtml_renderer_renderer_default, 100, 1, 0);
        var $10=HEAP[$options];
        var $11=$10;
        var $12=HEAP[$1];
        var $13=($12+96)&4294967295;
        HEAP[$13]=$11;
        var $14=HEAP[$2];
        var $15=($14) & 4;
        var $16=((($15))|0)!=0;
        if ($16) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $17
        var $18=HEAP[$1];
        var $19=($18+60)&4294967295;
        HEAP[$19]=0;
        __label__ = 1; break;
      case 1: // $20
        var $21=HEAP[$2];
        var $22=($21) & 8;
        var $23=((($22))|0)!=0;
        if ($23) { __label__ = 2; break; } else { __label__ = 3; break; }
      case 2: // $24
        var $25=HEAP[$1];
        var $26=($25+68)&4294967295;
        HEAP[$26]=0;
        var $27=HEAP[$1];
        var $28=($27+44)&4294967295;
        HEAP[$28]=0;
        __label__ = 3; break;
      case 3: // $29
        var $30=HEAP[$2];
        var $31=($30) & 16;
        var $32=((($31))|0)!=0;
        if ($32) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $33
        var $34=HEAP[$1];
        var $35=($34+84)&4294967295;
        HEAP[$35]=24;
        __label__ = 5; break;
      case 5: // $36
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_blockcode($ob, $text, $lang, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 16);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        HEAP[$1]=$ob;
        HEAP[$2]=$text;
        HEAP[$3]=$lang;
        HEAP[$4]=$opaque;
        var $5=HEAP[$1];
        var $6=($5+4)&4294967295;
        var $7=HEAP[$6];
        var $8=((($7))|0)!=0;
        if ($8) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $9
        var $10=HEAP[$1];
        _bufputc($10, 10);
        __label__ = 1; break;
      case 1: // $11
        var $12=HEAP[$3];
        var $13=($12)!=0;
        if ($13) { __label__ = 2; break; } else { __label__ = 3; break; }
      case 2: // $14
        var $15=HEAP[$3];
        var $16=($15+4)&4294967295;
        var $17=HEAP[$16];
        var $18=((($17))|0)!=0;
        if ($18) { __label__ = 4; break; } else { __label__ = 3; break; }
      case 4: // $19
        var $20=HEAP[$1];
        _bufput($20, (__str72)&4294967295, 11);
        var $21=HEAP[$1];
        var $22=HEAP[$3];
        var $23=($22)&4294967295;
        var $24=HEAP[$23];
        var $25=HEAP[$3];
        var $26=($25+4)&4294967295;
        var $27=HEAP[$26];
        _bufput($21, $24, $27);
        var $28=HEAP[$1];
        _bufput($28, (__str73)&4294967295, 8);
        __label__ = 5; break;
      case 3: // $29
        var $30=HEAP[$1];
        _bufput($30, (__str74)&4294967295, 11);
        __label__ = 5; break;
      case 5: // $31
        var $32=HEAP[$2];
        var $33=($32)!=0;
        if ($33) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $34
        var $35=HEAP[$1];
        var $36=HEAP[$2];
        var $37=($36)&4294967295;
        var $38=HEAP[$37];
        var $39=HEAP[$2];
        var $40=($39+4)&4294967295;
        var $41=HEAP[$40];
        _lus_attr_escape($35, $38, $41);
        __label__ = 7; break;
      case 7: // $42
        var $43=HEAP[$1];
        _bufput($43, (__str75)&4294967295, 14);
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_blockquote($ob, $text, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 12);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        HEAP[$1]=$ob;
        HEAP[$2]=$text;
        HEAP[$3]=$opaque;
        var $4=HEAP[$1];
        _bufput($4, (__str70)&4294967295, 13);
        var $5=HEAP[$2];
        var $6=($5)!=0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        var $8=HEAP[$1];
        var $9=HEAP[$2];
        var $10=($9)&4294967295;
        var $11=HEAP[$10];
        var $12=HEAP[$2];
        var $13=($12+4)&4294967295;
        var $14=HEAP[$13];
        _bufput($8, $11, $14);
        __label__ = 1; break;
      case 1: // $15
        var $16=HEAP[$1];
        _bufput($16, (__str71)&4294967295, 13);
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_raw_block($ob, $text, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 20);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $org=__stackBase__+12;
        var $sz=__stackBase__+16;
        HEAP[$1]=$ob;
        HEAP[$2]=$text;
        HEAP[$3]=$opaque;
        var $4=HEAP[$2];
        var $5=($4)!=0;
        if ($5) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $6
        __label__ = 2; break;
      case 0: // $7
        var $8=HEAP[$2];
        var $9=($8+4)&4294967295;
        var $10=HEAP[$9];
        HEAP[$sz]=$10;
        __label__ = 3; break;
      case 3: // $11
        var $12=HEAP[$sz];
        var $13=unSign(($12), 32, 0) > 0;
        if ($13) { __lastLabel__ = 3; __label__ = 4; break; } else { __lastLabel__ = 3; __label__ = 5; break; }
      case 4: // $14
        var $15=HEAP[$sz];
        var $16=(($15) - 1)&4294967295;
        var $17=HEAP[$2];
        var $18=($17)&4294967295;
        var $19=HEAP[$18];
        var $20=($19+$16)&4294967295;
        var $21=HEAP[$20];
        var $22=reSign(($21), 8, 0);
        var $23=((($22))|0)==10;
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $24
        var $25=__lastLabel__ == 3 ? 0 : ($23);
        if ($25) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $26
        var $27=HEAP[$sz];
        var $28=(($27) - 1)&4294967295;
        HEAP[$sz]=$28;
        __label__ = 3; break;
      case 7: // $29
        HEAP[$org]=0;
        __label__ = 8; break;
      case 8: // $30
        var $31=HEAP[$org];
        var $32=HEAP[$sz];
        var $33=unSign(($31), 32, 0) < unSign(($32), 32, 0);
        if ($33) { __lastLabel__ = 8; __label__ = 9; break; } else { __lastLabel__ = 8; __label__ = 10; break; }
      case 9: // $34
        var $35=HEAP[$org];
        var $36=HEAP[$2];
        var $37=($36)&4294967295;
        var $38=HEAP[$37];
        var $39=($38+$35)&4294967295;
        var $40=HEAP[$39];
        var $41=reSign(($40), 8, 0);
        var $42=((($41))|0)==10;
        __lastLabel__ = 9; __label__ = 10; break;
      case 10: // $43
        var $44=__lastLabel__ == 8 ? 0 : ($42);
        if ($44) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $45
        var $46=HEAP[$org];
        var $47=(($46) + 1)&4294967295;
        HEAP[$org]=$47;
        __label__ = 8; break;
      case 12: // $48
        var $49=HEAP[$org];
        var $50=HEAP[$sz];
        var $51=unSign(($49), 32, 0) >= unSign(($50), 32, 0);
        if ($51) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $52
        __label__ = 2; break;
      case 14: // $53
        var $54=HEAP[$1];
        var $55=($54+4)&4294967295;
        var $56=HEAP[$55];
        var $57=((($56))|0)!=0;
        if ($57) { __label__ = 15; break; } else { __label__ = 16; break; }
      case 15: // $58
        var $59=HEAP[$1];
        _bufputc($59, 10);
        __label__ = 16; break;
      case 16: // $60
        var $61=HEAP[$1];
        var $62=HEAP[$2];
        var $63=($62)&4294967295;
        var $64=HEAP[$63];
        var $65=HEAP[$org];
        var $66=($64+$65)&4294967295;
        var $67=HEAP[$sz];
        var $68=HEAP[$org];
        var $69=(($67) - ($68))&4294967295;
        _bufput($61, $66, $69);
        var $70=HEAP[$1];
        _bufputc($70, 10);
        __label__ = 2; break;
      case 2: // $71
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_header($ob, $text, $level, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 20);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $options=__stackBase__+16;
        HEAP[$1]=$ob;
        HEAP[$2]=$text;
        HEAP[$3]=$level;
        HEAP[$4]=$opaque;
        var $5=HEAP[$4];
        var $6=$5;
        HEAP[$options]=$6;
        var $7=HEAP[$1];
        var $8=($7+4)&4294967295;
        var $9=HEAP[$8];
        var $10=((($9))|0)!=0;
        if ($10) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $11
        var $12=HEAP[$1];
        _bufputc($12, 10);
        __label__ = 1; break;
      case 1: // $13
        var $14=HEAP[$options];
        var $15=($14+8)&4294967295;
        var $16=HEAP[$15];
        var $17=($16) & 256;
        var $18=((($17))|0)!=0;
        if ($18) { __label__ = 2; break; } else { __label__ = 3; break; }
      case 2: // $19
        var $20=HEAP[$1];
        var $21=HEAP[$options];
        var $22=($21)&4294967295;
        var $23=($22)&4294967295;
        var $24=HEAP[$23];
        var $25=(($24) + 1)&4294967295;
        HEAP[$23]=$25;
        _bufprintf($20, (__str67)&4294967295, Pointer_make([$24,0,0,0], 0, ALLOC_STACK));
        __label__ = 3; break;
      case 3: // $26
        var $27=HEAP[$1];
        var $28=HEAP[$3];
        _bufprintf($27, (__str68)&4294967295, Pointer_make([$28,0,0,0], 0, ALLOC_STACK));
        var $29=HEAP[$2];
        var $30=($29)!=0;
        if ($30) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $31
        var $32=HEAP[$1];
        var $33=HEAP[$2];
        var $34=($33)&4294967295;
        var $35=HEAP[$34];
        var $36=HEAP[$2];
        var $37=($36+4)&4294967295;
        var $38=HEAP[$37];
        _bufput($32, $35, $38);
        __label__ = 5; break;
      case 5: // $39
        var $40=HEAP[$1];
        var $41=HEAP[$3];
        _bufprintf($40, (__str69)&4294967295, Pointer_make([$41,0,0,0], 0, ALLOC_STACK));
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_hrule($ob, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 8);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        HEAP[$1]=$ob;
        HEAP[$2]=$opaque;
        var $3=HEAP[$1];
        var $4=($3+4)&4294967295;
        var $5=HEAP[$4];
        var $6=((($5))|0)!=0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        var $8=HEAP[$1];
        _bufputc($8, 10);
        __label__ = 1; break;
      case 1: // $9
        var $10=HEAP[$1];
        _bufput($10, (__str66)&4294967295, 7);
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_list($ob, $text, $flags, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 16);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        HEAP[$1]=$ob;
        HEAP[$2]=$text;
        HEAP[$3]=$flags;
        HEAP[$4]=$opaque;
        var $5=HEAP[$1];
        var $6=($5+4)&4294967295;
        var $7=HEAP[$6];
        var $8=((($7))|0)!=0;
        if ($8) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $9
        var $10=HEAP[$1];
        _bufputc($10, 10);
        __label__ = 1; break;
      case 1: // $11
        var $12=HEAP[$1];
        var $13=HEAP[$3];
        var $14=($13) & 1;
        var $15=((($14))|0)!=0;
        if ($15) { __label__ = 2; break; } else { __label__ = 3; break; }
      case 2: // $16
        __lastLabel__ = 2; __label__ = 4; break;
      case 3: // $17
        __lastLabel__ = 3; __label__ = 4; break;
      case 4: // $18
        var $19=__lastLabel__ == 2 ? (__str62)&4294967295 : ((__str63)&4294967295);
        _bufput($12, $19, 5);
        var $20=HEAP[$2];
        var $21=($20)!=0;
        if ($21) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $22
        var $23=HEAP[$1];
        var $24=HEAP[$2];
        var $25=($24)&4294967295;
        var $26=HEAP[$25];
        var $27=HEAP[$2];
        var $28=($27+4)&4294967295;
        var $29=HEAP[$28];
        _bufput($23, $26, $29);
        __label__ = 6; break;
      case 6: // $30
        var $31=HEAP[$1];
        var $32=HEAP[$3];
        var $33=($32) & 1;
        var $34=((($33))|0)!=0;
        if ($34) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $35
        __lastLabel__ = 7; __label__ = 9; break;
      case 8: // $36
        __lastLabel__ = 8; __label__ = 9; break;
      case 9: // $37
        var $38=__lastLabel__ == 7 ? (__str64)&4294967295 : ((__str65)&4294967295);
        _bufput($31, $38, 6);
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_listitem($ob, $text, $flags, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 16);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        HEAP[$1]=$ob;
        HEAP[$2]=$text;
        HEAP[$3]=$flags;
        HEAP[$4]=$opaque;
        var $5=HEAP[$1];
        _bufput($5, (__str60)&4294967295, 4);
        var $6=HEAP[$2];
        var $7=($6)!=0;
        if ($7) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $8
        __label__ = 2; break;
      case 2: // $9
        var $10=HEAP[$2];
        var $11=($10+4)&4294967295;
        var $12=HEAP[$11];
        var $13=((($12))|0)!=0;
        if ($13) { __lastLabel__ = 2; __label__ = 3; break; } else { __lastLabel__ = 2; __label__ = 4; break; }
      case 3: // $14
        var $15=HEAP[$2];
        var $16=($15+4)&4294967295;
        var $17=HEAP[$16];
        var $18=(($17) - 1)&4294967295;
        var $19=HEAP[$2];
        var $20=($19)&4294967295;
        var $21=HEAP[$20];
        var $22=($21+$18)&4294967295;
        var $23=HEAP[$22];
        var $24=reSign(($23), 8, 0);
        var $25=((($24))|0)==10;
        __lastLabel__ = 3; __label__ = 4; break;
      case 4: // $26
        var $27=__lastLabel__ == 2 ? 0 : ($25);
        if ($27) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $28
        var $29=HEAP[$2];
        var $30=($29+4)&4294967295;
        var $31=HEAP[$30];
        var $32=(($31) - 1)&4294967295;
        HEAP[$30]=$32;
        __label__ = 2; break;
      case 6: // $33
        var $34=HEAP[$1];
        var $35=HEAP[$2];
        var $36=($35)&4294967295;
        var $37=HEAP[$36];
        var $38=HEAP[$2];
        var $39=($38+4)&4294967295;
        var $40=HEAP[$39];
        _bufput($34, $37, $40);
        __label__ = 1; break;
      case 1: // $41
        var $42=HEAP[$1];
        _bufput($42, (__str61)&4294967295, 6);
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_paragraph($ob, $text, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 24);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $options=__stackBase__+12;
        var $i=__stackBase__+16;
        var $org=__stackBase__+20;
        HEAP[$1]=$ob;
        HEAP[$2]=$text;
        HEAP[$3]=$opaque;
        var $4=HEAP[$3];
        var $5=$4;
        HEAP[$options]=$5;
        HEAP[$i]=0;
        var $6=HEAP[$1];
        var $7=($6+4)&4294967295;
        var $8=HEAP[$7];
        var $9=((($8))|0)!=0;
        if ($9) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $10
        var $11=HEAP[$1];
        _bufputc($11, 10);
        __label__ = 1; break;
      case 1: // $12
        var $13=HEAP[$2];
        var $14=($13)!=0;
        if ($14) { __label__ = 2; break; } else { __label__ = 3; break; }
      case 2: // $15
        var $16=HEAP[$2];
        var $17=($16+4)&4294967295;
        var $18=HEAP[$17];
        var $19=((($18))|0)!=0;
        if ($19) { __label__ = 4; break; } else { __label__ = 3; break; }
      case 3: // $20
        __label__ = 5; break;
      case 4: // $21
        __label__ = 6; break;
      case 6: // $22
        var $23=HEAP[$i];
        var $24=HEAP[$2];
        var $25=($24+4)&4294967295;
        var $26=HEAP[$25];
        var $27=unSign(($23), 32, 0) < unSign(($26), 32, 0);
        if ($27) { __lastLabel__ = 6; __label__ = 7; break; } else { __lastLabel__ = 6; __label__ = 8; break; }
      case 7: // $28
        var $29=HEAP[$i];
        var $30=HEAP[$2];
        var $31=($30)&4294967295;
        var $32=HEAP[$31];
        var $33=($32+$29)&4294967295;
        var $34=HEAP[$33];
        var $35=reSign(($34), 8, 0);
        var $36=_isspace57($35);
        var $37=((($36))|0)!=0;
        __lastLabel__ = 7; __label__ = 8; break;
      case 8: // $38
        var $39=__lastLabel__ == 6 ? 0 : ($37);
        if ($39) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $40
        var $41=HEAP[$i];
        var $42=(($41) + 1)&4294967295;
        HEAP[$i]=$42;
        __label__ = 6; break;
      case 10: // $43
        var $44=HEAP[$i];
        var $45=HEAP[$2];
        var $46=($45+4)&4294967295;
        var $47=HEAP[$46];
        var $48=((($44))|0)==((($47))|0);
        if ($48) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $49
        __label__ = 5; break;
      case 12: // $50
        var $51=HEAP[$1];
        _bufput($51, (__str57)&4294967295, 3);
        var $52=HEAP[$options];
        var $53=($52+8)&4294967295;
        var $54=HEAP[$53];
        var $55=($54) & 512;
        var $56=((($55))|0)!=0;
        if ($56) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $57
        __label__ = 15; break;
      case 15: // $58
        var $59=HEAP[$i];
        var $60=HEAP[$2];
        var $61=($60+4)&4294967295;
        var $62=HEAP[$61];
        var $63=unSign(($59), 32, 0) < unSign(($62), 32, 0);
        if ($63) { __label__ = 16; break; } else { __label__ = 17; break; }
      case 16: // $64
        var $65=HEAP[$i];
        HEAP[$org]=$65;
        __label__ = 18; break;
      case 18: // $66
        var $67=HEAP[$i];
        var $68=HEAP[$2];
        var $69=($68+4)&4294967295;
        var $70=HEAP[$69];
        var $71=unSign(($67), 32, 0) < unSign(($70), 32, 0);
        if ($71) { __lastLabel__ = 18; __label__ = 19; break; } else { __lastLabel__ = 18; __label__ = 20; break; }
      case 19: // $72
        var $73=HEAP[$i];
        var $74=HEAP[$2];
        var $75=($74)&4294967295;
        var $76=HEAP[$75];
        var $77=($76+$73)&4294967295;
        var $78=HEAP[$77];
        var $79=reSign(($78), 8, 0);
        var $80=((($79))|0)!=10;
        __lastLabel__ = 19; __label__ = 20; break;
      case 20: // $81
        var $82=__lastLabel__ == 18 ? 0 : ($80);
        if ($82) { __label__ = 21; break; } else { __label__ = 22; break; }
      case 21: // $83
        var $84=HEAP[$i];
        var $85=(($84) + 1)&4294967295;
        HEAP[$i]=$85;
        __label__ = 18; break;
      case 22: // $86
        var $87=HEAP[$i];
        var $88=HEAP[$org];
        var $89=unSign(($87), 32, 0) > unSign(($88), 32, 0);
        if ($89) { __label__ = 23; break; } else { __label__ = 24; break; }
      case 23: // $90
        var $91=HEAP[$1];
        var $92=HEAP[$2];
        var $93=($92)&4294967295;
        var $94=HEAP[$93];
        var $95=HEAP[$org];
        var $96=($94+$95)&4294967295;
        var $97=HEAP[$i];
        var $98=HEAP[$org];
        var $99=(($97) - ($98))&4294967295;
        _bufput($91, $96, $99);
        __label__ = 24; break;
      case 24: // $100
        var $101=HEAP[$i];
        var $102=HEAP[$2];
        var $103=($102+4)&4294967295;
        var $104=HEAP[$103];
        var $105=unSign(($101), 32, 0) >= unSign(($104), 32, 0);
        if ($105) { __label__ = 25; break; } else { __label__ = 26; break; }
      case 25: // $106
        __label__ = 17; break;
      case 26: // $107
        var $108=HEAP[$1];
        _bufput($108, (__str58)&4294967295, 6);
        var $109=HEAP[$i];
        var $110=(($109) + 1)&4294967295;
        HEAP[$i]=$110;
        __label__ = 15; break;
      case 17: // $111
        __label__ = 27; break;
      case 14: // $112
        var $113=HEAP[$1];
        var $114=HEAP[$i];
        var $115=HEAP[$2];
        var $116=($115)&4294967295;
        var $117=HEAP[$116];
        var $118=($117+$114)&4294967295;
        var $119=HEAP[$2];
        var $120=($119+4)&4294967295;
        var $121=HEAP[$120];
        var $122=HEAP[$i];
        var $123=(($121) - ($122))&4294967295;
        _bufput($113, $118, $123);
        __label__ = 27; break;
      case 27: // $124
        var $125=HEAP[$1];
        _bufput($125, (__str59)&4294967295, 5);
        __label__ = 5; break;
      case 5: // $126
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_table($ob, $header, $body, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 16);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        HEAP[$1]=$ob;
        HEAP[$2]=$header;
        HEAP[$3]=$body;
        HEAP[$4]=$opaque;
        var $5=HEAP[$1];
        var $6=($5+4)&4294967295;
        var $7=HEAP[$6];
        var $8=((($7))|0)!=0;
        if ($8) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $9
        var $10=HEAP[$1];
        _bufputc($10, 10);
        __label__ = 1; break;
      case 1: // $11
        var $12=HEAP[$1];
        _bufput($12, (__str54)&4294967295, 15);
        var $13=HEAP[$2];
        var $14=($13)!=0;
        if ($14) { __label__ = 2; break; } else { __label__ = 3; break; }
      case 2: // $15
        var $16=HEAP[$1];
        var $17=HEAP[$2];
        var $18=($17)&4294967295;
        var $19=HEAP[$18];
        var $20=HEAP[$2];
        var $21=($20+4)&4294967295;
        var $22=HEAP[$21];
        _bufput($16, $19, $22);
        __label__ = 3; break;
      case 3: // $23
        var $24=HEAP[$1];
        _bufput($24, (__str55)&4294967295, 17);
        var $25=HEAP[$3];
        var $26=($25)!=0;
        if ($26) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $27
        var $28=HEAP[$1];
        var $29=HEAP[$3];
        var $30=($29)&4294967295;
        var $31=HEAP[$30];
        var $32=HEAP[$3];
        var $33=($32+4)&4294967295;
        var $34=HEAP[$33];
        _bufput($28, $31, $34);
        __label__ = 5; break;
      case 5: // $35
        var $36=HEAP[$1];
        _bufput($36, (__str56)&4294967295, 17);
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_tablerow($ob, $text, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 12);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        HEAP[$1]=$ob;
        HEAP[$2]=$text;
        HEAP[$3]=$opaque;
        var $4=HEAP[$1];
        var $5=($4+4)&4294967295;
        var $6=HEAP[$5];
        var $7=((($6))|0)!=0;
        if ($7) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $8
        var $9=HEAP[$1];
        _bufputc($9, 10);
        __label__ = 1; break;
      case 1: // $10
        var $11=HEAP[$1];
        _bufput($11, (__str52)&4294967295, 5);
        var $12=HEAP[$2];
        var $13=($12)!=0;
        if ($13) { __label__ = 2; break; } else { __label__ = 3; break; }
      case 2: // $14
        var $15=HEAP[$1];
        var $16=HEAP[$2];
        var $17=($16)&4294967295;
        var $18=HEAP[$17];
        var $19=HEAP[$2];
        var $20=($19+4)&4294967295;
        var $21=HEAP[$20];
        _bufput($15, $18, $21);
        __label__ = 3; break;
      case 3: // $22
        var $23=HEAP[$1];
        _bufput($23, (__str53)&4294967295, 6);
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_tablecell($ob, $text, $align, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 16);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        HEAP[$1]=$ob;
        HEAP[$2]=$text;
        HEAP[$3]=$align;
        HEAP[$4]=$opaque;
        var $5=HEAP[$1];
        var $6=($5+4)&4294967295;
        var $7=HEAP[$6];
        var $8=((($7))|0)!=0;
        if ($8) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $9
        var $10=HEAP[$1];
        _bufputc($10, 10);
        __label__ = 1; break;
      case 1: // $11
        var $12=HEAP[$3];
        if ($12 == 1) {
          __label__ = 5; break;
        }
        else if ($12 == 2) {
          __label__ = 6; break;
        }
        else if ($12 == 3) {
          __label__ = 7; break;
        }
        else {
        __label__ = 8; break;
        }
        
      case 5: // $13
        var $14=HEAP[$1];
        _bufput($14, (__str47)&4294967295, 17);
        __label__ = 2; break;
      case 6: // $15
        var $16=HEAP[$1];
        _bufput($16, (__str48)&4294967295, 18);
        __label__ = 2; break;
      case 7: // $17
        var $18=HEAP[$1];
        _bufput($18, (__str49)&4294967295, 19);
        __label__ = 2; break;
      case 8: // $19
        var $20=HEAP[$1];
        _bufput($20, (__str50)&4294967295, 4);
        __label__ = 2; break;
      case 2: // $21
        var $22=HEAP[$2];
        var $23=($22)!=0;
        if ($23) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $24
        var $25=HEAP[$1];
        var $26=HEAP[$2];
        var $27=($26)&4294967295;
        var $28=HEAP[$27];
        var $29=HEAP[$2];
        var $30=($29+4)&4294967295;
        var $31=HEAP[$30];
        _bufput($25, $28, $31);
        __label__ = 4; break;
      case 4: // $32
        var $33=HEAP[$1];
        _bufput($33, (__str51)&4294967295, 5);
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_autolink($ob, $link, $type, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 24);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $options=__stackBase__+20;
        HEAP[$2]=$ob;
        HEAP[$3]=$link;
        HEAP[$4]=$type;
        HEAP[$5]=$opaque;
        var $6=HEAP[$5];
        var $7=$6;
        HEAP[$options]=$7;
        var $8=HEAP[$3];
        var $9=($8)!=0;
        if ($9) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $10
        var $11=HEAP[$3];
        var $12=($11+4)&4294967295;
        var $13=HEAP[$12];
        var $14=((($13))|0)!=0;
        if ($14) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 1: // $15
        HEAP[$1]=0;
        __label__ = 3; break;
      case 2: // $16
        var $17=HEAP[$options];
        var $18=($17+8)&4294967295;
        var $19=HEAP[$18];
        var $20=($19) & 128;
        var $21=((($20))|0)!=0;
        if ($21) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $22
        var $23=HEAP[$3];
        var $24=($23)&4294967295;
        var $25=HEAP[$24];
        var $26=HEAP[$3];
        var $27=($26+4)&4294967295;
        var $28=HEAP[$27];
        var $29=_is_safe_link($25, $28);
        var $30=((($29))|0)!=0;
        if ($30) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 6: // $31
        HEAP[$1]=0;
        __label__ = 3; break;
      case 5: // $32
        var $33=HEAP[$2];
        _bufput($33, (__str38)&4294967295, 9);
        var $34=HEAP[$4];
        var $35=((($34))|0)==3;
        if ($35) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $36
        var $37=HEAP[$2];
        _bufput($37, (__str46)&4294967295, 7);
        __label__ = 8; break;
      case 8: // $38
        var $39=HEAP[$2];
        var $40=HEAP[$3];
        var $41=($40)&4294967295;
        var $42=HEAP[$41];
        var $43=HEAP[$3];
        var $44=($43+4)&4294967295;
        var $45=HEAP[$44];
        _bufput($39, $42, $45);
        var $46=HEAP[$2];
        _bufput($46, (__str40)&4294967295, 2);
        var $47=HEAP[$4];
        var $48=((($47))|0)==2;
        if ($48) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $49
        var $50=HEAP[$3];
        var $51=($50+4)&4294967295;
        var $52=HEAP[$51];
        var $53=unSign(($52), 32, 0) > 7;
        if ($53) { __label__ = 11; break; } else { __label__ = 10; break; }
      case 11: // $54
        var $55=HEAP[$2];
        var $56=HEAP[$3];
        var $57=($56)&4294967295;
        var $58=HEAP[$57];
        var $59=($58+7)&4294967295;
        var $60=HEAP[$3];
        var $61=($60+4)&4294967295;
        var $62=HEAP[$61];
        var $63=(($62) - 7)&4294967295;
        _lus_attr_escape($55, $59, $63);
        __label__ = 12; break;
      case 10: // $64
        var $65=HEAP[$2];
        var $66=HEAP[$3];
        var $67=($66)&4294967295;
        var $68=HEAP[$67];
        var $69=HEAP[$3];
        var $70=($69+4)&4294967295;
        var $71=HEAP[$70];
        _lus_attr_escape($65, $68, $71);
        __label__ = 12; break;
      case 12: // $72
        var $73=HEAP[$2];
        _bufput($73, (__str41)&4294967295, 4);
        HEAP[$1]=1;
        __label__ = 3; break;
      case 3: // $74
        var $75=HEAP[$1];
        STACKTOP = __stackBase__;
        return $75;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_image($ob, $link, $title, $alt, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 24);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $6=__stackBase__+20;
        HEAP[$2]=$ob;
        HEAP[$3]=$link;
        HEAP[$4]=$title;
        HEAP[$5]=$alt;
        HEAP[$6]=$opaque;
        var $7=HEAP[$3];
        var $8=($7)!=0;
        if ($8) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $9
        var $10=HEAP[$3];
        var $11=($10+4)&4294967295;
        var $12=HEAP[$11];
        var $13=((($12))|0)!=0;
        if ($13) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 1: // $14
        HEAP[$1]=0;
        __label__ = 3; break;
      case 2: // $15
        var $16=HEAP[$2];
        _bufput($16, (__str43)&4294967295, 10);
        var $17=HEAP[$2];
        var $18=HEAP[$3];
        var $19=($18)&4294967295;
        var $20=HEAP[$19];
        var $21=HEAP[$3];
        var $22=($21+4)&4294967295;
        var $23=HEAP[$22];
        _lus_attr_escape($17, $20, $23);
        var $24=HEAP[$2];
        _bufput($24, (__str44)&4294967295, 7);
        var $25=HEAP[$5];
        var $26=($25)!=0;
        if ($26) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $27
        var $28=HEAP[$5];
        var $29=($28+4)&4294967295;
        var $30=HEAP[$29];
        var $31=((($30))|0)!=0;
        if ($31) { __label__ = 6; break; } else { __label__ = 5; break; }
      case 6: // $32
        var $33=HEAP[$2];
        var $34=HEAP[$5];
        var $35=($34)&4294967295;
        var $36=HEAP[$35];
        var $37=HEAP[$5];
        var $38=($37+4)&4294967295;
        var $39=HEAP[$38];
        _lus_attr_escape($33, $36, $39);
        __label__ = 5; break;
      case 5: // $40
        var $41=HEAP[$4];
        var $42=($41)!=0;
        if ($42) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $43
        var $44=HEAP[$4];
        var $45=($44+4)&4294967295;
        var $46=HEAP[$45];
        var $47=((($46))|0)!=0;
        if ($47) { __label__ = 9; break; } else { __label__ = 8; break; }
      case 9: // $48
        var $49=HEAP[$2];
        _bufput($49, (__str39)&4294967295, 9);
        var $50=HEAP[$2];
        var $51=HEAP[$4];
        var $52=($51)&4294967295;
        var $53=HEAP[$52];
        var $54=HEAP[$4];
        var $55=($54+4)&4294967295;
        var $56=HEAP[$55];
        _lus_attr_escape($50, $53, $56);
        __label__ = 8; break;
      case 8: // $57
        var $58=HEAP[$2];
        _bufput($58, (__str45)&4294967295, 4);
        HEAP[$1]=1;
        __label__ = 3; break;
      case 3: // $59
        var $60=HEAP[$1];
        STACKTOP = __stackBase__;
        return $60;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_linebreak($ob, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 8);
    var __label__;
  
    var $1=__stackBase__;
    var $2=__stackBase__+4;
    HEAP[$1]=$ob;
    HEAP[$2]=$opaque;
    var $3=HEAP[$1];
    _bufput($3, (__str42)&4294967295, 7);
    STACKTOP = __stackBase__;
    return 1;
  }
  

  function _rndr_link($ob, $link, $title, $content, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 28; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 28);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $6=__stackBase__+20;
        var $options=__stackBase__+24;
        HEAP[$2]=$ob;
        HEAP[$3]=$link;
        HEAP[$4]=$title;
        HEAP[$5]=$content;
        HEAP[$6]=$opaque;
        var $7=HEAP[$6];
        var $8=$7;
        HEAP[$options]=$8;
        var $9=HEAP[$options];
        var $10=($9+8)&4294967295;
        var $11=HEAP[$10];
        var $12=($11) & 128;
        var $13=((($12))|0)!=0;
        if ($13) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $14
        var $15=HEAP[$3];
        var $16=($15)&4294967295;
        var $17=HEAP[$16];
        var $18=HEAP[$3];
        var $19=($18+4)&4294967295;
        var $20=HEAP[$19];
        var $21=_is_safe_link($17, $20);
        var $22=((($21))|0)!=0;
        if ($22) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 2: // $23
        HEAP[$1]=0;
        __label__ = 3; break;
      case 1: // $24
        var $25=HEAP[$2];
        _bufput($25, (__str38)&4294967295, 9);
        var $26=HEAP[$3];
        var $27=($26)!=0;
        if ($27) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $28
        var $29=HEAP[$3];
        var $30=($29+4)&4294967295;
        var $31=HEAP[$30];
        var $32=((($31))|0)!=0;
        if ($32) { __label__ = 6; break; } else { __label__ = 5; break; }
      case 6: // $33
        var $34=HEAP[$2];
        var $35=HEAP[$3];
        var $36=($35)&4294967295;
        var $37=HEAP[$36];
        var $38=HEAP[$3];
        var $39=($38+4)&4294967295;
        var $40=HEAP[$39];
        _lus_attr_escape($34, $37, $40);
        __label__ = 5; break;
      case 5: // $41
        var $42=HEAP[$4];
        var $43=($42)!=0;
        if ($43) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $44
        var $45=HEAP[$4];
        var $46=($45+4)&4294967295;
        var $47=HEAP[$46];
        var $48=((($47))|0)!=0;
        if ($48) { __label__ = 9; break; } else { __label__ = 8; break; }
      case 9: // $49
        var $50=HEAP[$2];
        _bufput($50, (__str39)&4294967295, 9);
        var $51=HEAP[$2];
        var $52=HEAP[$4];
        var $53=($52)&4294967295;
        var $54=HEAP[$53];
        var $55=HEAP[$4];
        var $56=($55+4)&4294967295;
        var $57=HEAP[$56];
        _lus_attr_escape($51, $54, $57);
        __label__ = 8; break;
      case 8: // $58
        var $59=HEAP[$2];
        _bufput($59, (__str40)&4294967295, 2);
        var $60=HEAP[$5];
        var $61=($60)!=0;
        if ($61) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $62
        var $63=HEAP[$5];
        var $64=($63+4)&4294967295;
        var $65=HEAP[$64];
        var $66=((($65))|0)!=0;
        if ($66) { __label__ = 12; break; } else { __label__ = 11; break; }
      case 12: // $67
        var $68=HEAP[$2];
        var $69=HEAP[$5];
        var $70=($69)&4294967295;
        var $71=HEAP[$70];
        var $72=HEAP[$5];
        var $73=($72+4)&4294967295;
        var $74=HEAP[$73];
        _bufput($68, $71, $74);
        __label__ = 11; break;
      case 11: // $75
        var $76=HEAP[$2];
        _bufput($76, (__str41)&4294967295, 4);
        HEAP[$1]=1;
        __label__ = 3; break;
      case 3: // $77
        var $78=HEAP[$1];
        STACKTOP = __stackBase__;
        return $78;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_raw_html($ob, $text, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 20);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $options=__stackBase__+12;
        var $escape_html=__stackBase__+16;
        HEAP[$1]=$ob;
        HEAP[$2]=$text;
        HEAP[$3]=$opaque;
        var $4=HEAP[$3];
        var $5=$4;
        HEAP[$options]=$5;
        HEAP[$escape_html]=0;
        var $6=HEAP[$options];
        var $7=($6+8)&4294967295;
        var $8=HEAP[$7];
        var $9=($8) & 1;
        var $10=((($9))|0)!=0;
        if ($10) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $11
        HEAP[$escape_html]=1;
        __label__ = 2; break;
      case 1: // $12
        var $13=HEAP[$options];
        var $14=($13+8)&4294967295;
        var $15=HEAP[$14];
        var $16=($15) & 2;
        var $17=((($16))|0)!=0;
        if ($17) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $18
        var $19=HEAP[$2];
        var $20=_is_html_tag($19, (__str35)&4294967295);
        var $21=((($20))|0)!=0;
        if ($21) { __label__ = 5; break; } else { __label__ = 4; break; }
      case 5: // $22
        HEAP[$escape_html]=1;
        __label__ = 6; break;
      case 4: // $23
        var $24=HEAP[$options];
        var $25=($24+8)&4294967295;
        var $26=HEAP[$25];
        var $27=($26) & 8;
        var $28=((($27))|0)!=0;
        if ($28) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $29
        var $30=HEAP[$2];
        var $31=_is_html_tag($30, (__str36)&4294967295);
        var $32=((($31))|0)!=0;
        if ($32) { __label__ = 9; break; } else { __label__ = 8; break; }
      case 9: // $33
        HEAP[$escape_html]=1;
        __label__ = 10; break;
      case 8: // $34
        var $35=HEAP[$options];
        var $36=($35+8)&4294967295;
        var $37=HEAP[$36];
        var $38=($37) & 4;
        var $39=((($38))|0)!=0;
        if ($39) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $40
        var $41=HEAP[$2];
        var $42=_is_html_tag($41, (__str37)&4294967295);
        var $43=((($42))|0)!=0;
        if ($43) { __label__ = 13; break; } else { __label__ = 12; break; }
      case 13: // $44
        HEAP[$escape_html]=1;
        __label__ = 12; break;
      case 12: // $45
        __label__ = 10; break;
      case 10: // $46
        __label__ = 6; break;
      case 6: // $47
        __label__ = 2; break;
      case 2: // $48
        var $49=HEAP[$escape_html];
        var $50=((($49))|0)!=0;
        if ($50) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 14: // $51
        var $52=HEAP[$1];
        var $53=HEAP[$2];
        var $54=($53)&4294967295;
        var $55=HEAP[$54];
        var $56=HEAP[$2];
        var $57=($56+4)&4294967295;
        var $58=HEAP[$57];
        _lus_attr_escape($52, $55, $58);
        __label__ = 16; break;
      case 15: // $59
        var $60=HEAP[$1];
        var $61=HEAP[$2];
        var $62=($61)&4294967295;
        var $63=HEAP[$62];
        var $64=HEAP[$2];
        var $65=($64+4)&4294967295;
        var $66=HEAP[$65];
        _bufput($60, $63, $66);
        __label__ = 16; break;
      case 16: // $67
        STACKTOP = __stackBase__;
        return 1;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_normal_text($ob, $text, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 12);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        HEAP[$1]=$ob;
        HEAP[$2]=$text;
        HEAP[$3]=$opaque;
        var $4=HEAP[$2];
        var $5=($4)!=0;
        if ($5) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $6
        var $7=HEAP[$1];
        var $8=HEAP[$2];
        var $9=($8)&4294967295;
        var $10=HEAP[$9];
        var $11=HEAP[$2];
        var $12=($11+4)&4294967295;
        var $13=HEAP[$12];
        _lus_attr_escape($7, $10, $13);
        __label__ = 1; break;
      case 1: // $14
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _rndr_smartypants($ob, $text, $opaque) {
    var __stackBase__  = STACKTOP; STACKTOP += 33; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 33);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $i=__stackBase__+12;
        var $open_single=__stackBase__+16;
        var $open_double=__stackBase__+20;
        var $open_tag=__stackBase__+24;
        var $sub=__stackBase__+28;
        var $c=__stackBase__+32;
        HEAP[$1]=$ob;
        HEAP[$2]=$text;
        HEAP[$3]=$opaque;
        HEAP[$open_single]=0;
        HEAP[$open_double]=0;
        HEAP[$open_tag]=0;
        var $4=HEAP[$2];
        var $5=($4)!=0;
        if ($5) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $6
        __label__ = 2; break;
      case 0: // $7
        HEAP[$i]=0;
        __label__ = 3; break;
      case 3: // $8
        var $9=HEAP[$i];
        var $10=HEAP[$2];
        var $11=($10+4)&4294967295;
        var $12=HEAP[$11];
        var $13=unSign(($9), 32, 0) < unSign(($12), 32, 0);
        if ($13) { __label__ = 4; break; } else { __label__ = 2; break; }
      case 4: // $14
        var $15=HEAP[$i];
        var $16=HEAP[$2];
        var $17=($16)&4294967295;
        var $18=HEAP[$17];
        var $19=($18+$15)&4294967295;
        var $20=HEAP[$19];
        HEAP[$c]=$20;
        HEAP[$sub]=0;
        __label__ = 5; break;
      case 5: // $21
        var $22=HEAP[$sub];
        var $23=unSign(($22), 32, 0) < 20;
        if ($23) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $24
        var $25=HEAP[$c];
        var $26=reSign(($25), 8, 0);
        var $27=HEAP[$sub];
        var $28=(_smartypants_subs+$27*16)&4294967295;
        var $29=($28)&4294967295;
        var $30=HEAP[$29];
        var $31=reSign(($30), 8, 0);
        var $32=((($26))|0)==((($31))|0);
        if ($32) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $33
        var $34=HEAP[$2];
        var $35=HEAP[$i];
        var $36=HEAP[$sub];
        var $37=(_smartypants_subs+$36*16)&4294967295;
        var $38=($37+4)&4294967295;
        var $39=HEAP[$38];
        var $40=_smartypants_cmpsub($34, $35, $39);
        var $41=((($40))|0)!=0;
        if ($41) { __label__ = 10; break; } else { __label__ = 9; break; }
      case 10: // $42
        var $43=HEAP[$sub];
        var $44=(_smartypants_subs+$43*16)&4294967295;
        var $45=($44+8)&4294967295;
        var $46=HEAP[$45];
        var $47=($46)!=0;
        if ($47) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $48
        var $49=HEAP[$1];
        var $50=HEAP[$sub];
        var $51=(_smartypants_subs+$50*16)&4294967295;
        var $52=($51+8)&4294967295;
        var $53=HEAP[$52];
        _bufputs($49, $53);
        __label__ = 12; break;
      case 12: // $54
        var $55=HEAP[$sub];
        var $56=(_smartypants_subs+$55*16)&4294967295;
        var $57=($56+12)&4294967295;
        var $58=HEAP[$57];
        var $59=HEAP[$i];
        var $60=(($59) + ($58))&4294967295;
        HEAP[$i]=$60;
        __label__ = 7; break;
      case 9: // $61
        __label__ = 13; break;
      case 13: // $62
        var $63=HEAP[$sub];
        var $64=(($63) + 1)&4294967295;
        HEAP[$sub]=$64;
        __label__ = 5; break;
      case 7: // $65
        var $66=HEAP[$sub];
        var $67=unSign(($66), 32, 0) < 20;
        if ($67) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 14: // $68
        __label__ = 16; break;
      case 15: // $69
        var $70=HEAP[$c];
        var $71=reSign(($70), 8, 0);
        if ($71 == 60) {
          __label__ = 28; break;
        }
        else if ($71 == 62) {
          __label__ = 29; break;
        }
        else if ($71 == 34) {
          __label__ = 30; break;
        }
        else if ($71 == 39) {
          __label__ = 31; break;
        }
        else {
        __label__ = 17; break;
        }
        
      case 28: // $72
        HEAP[$open_tag]=1;
        __label__ = 17; break;
      case 29: // $73
        HEAP[$open_tag]=0;
        __label__ = 17; break;
      case 30: // $74
        var $75=HEAP[$open_tag];
        var $76=((($75))|0)==0;
        if ($76) { __label__ = 18; break; } else { __label__ = 19; break; }
      case 18: // $77
        var $78=HEAP[$1];
        var $79=HEAP[$2];
        var $80=HEAP[$i];
        var $81=HEAP[$open_double];
        var $82=_smartypants_quotes($78, $79, $80, $81);
        var $83=((($82))|0)!=0;
        if ($83) { __label__ = 20; break; } else { __label__ = 21; break; }
      case 20: // $84
        var $85=HEAP[$open_double];
        var $86=((($85))|0)!=0;
        var $87=($86) ^ 1;
        var $88=unSign(($87), 1, 0);
        HEAP[$open_double]=$88;
        __label__ = 16; break;
      case 21: // $89
        __label__ = 19; break;
      case 19: // $90
        __label__ = 17; break;
      case 31: // $91
        var $92=HEAP[$open_tag];
        var $93=((($92))|0)==0;
        if ($93) { __label__ = 22; break; } else { __label__ = 23; break; }
      case 22: // $94
        var $95=HEAP[$1];
        var $96=HEAP[$2];
        var $97=HEAP[$i];
        var $98=HEAP[$open_single];
        var $99=_smartypants_quotes($95, $96, $97, $98);
        var $100=((($99))|0)!=0;
        if ($100) { __label__ = 24; break; } else { __label__ = 25; break; }
      case 24: // $101
        var $102=HEAP[$open_single];
        var $103=((($102))|0)!=0;
        var $104=($103) ^ 1;
        var $105=unSign(($104), 1, 0);
        HEAP[$open_single]=$105;
        __label__ = 16; break;
      case 25: // $106
        __label__ = 23; break;
      case 23: // $107
        __label__ = 17; break;
      case 17: // $108
        var $109=HEAP[$1];
        var $110=HEAP[$c];
        var $111=_put_scaped_char($109, $110);
        var $112=((($111))|0)!=0;
        if ($112) { __label__ = 26; break; } else { __label__ = 27; break; }
      case 27: // $113
        var $114=HEAP[$1];
        var $115=HEAP[$c];
        _bufputc($114, $115);
        __label__ = 26; break;
      case 26: // $116
        __label__ = 16; break;
      case 16: // $117
        var $118=HEAP[$i];
        var $119=(($118) + 1)&4294967295;
        HEAP[$i]=$119;
        __label__ = 3; break;
      case 2: // $120
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _ups_free_renderer($renderer) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 4);
    var __label__;
  
    var $1=__stackBase__;
    HEAP[$1]=$renderer;
    var $2=HEAP[$1];
    var $3=($2+96)&4294967295;
    var $4=HEAP[$3];
    _free($4);
    STACKTOP = __stackBase__;
    return;
  }
  

  function _smartypants_cmpsub($buf, $start, $prefix) {
    var __stackBase__  = STACKTOP; STACKTOP += 22; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 22);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $i=__stackBase__+16;
        var $c=__stackBase__+20;
        var $p=__stackBase__+21;
        HEAP[$2]=$buf;
        HEAP[$3]=$start;
        HEAP[$4]=$prefix;
        var $5=HEAP[$4];
        var $6=($5)&4294967295;
        var $7=HEAP[$6];
        var $8=reSign(($7), 8, 0);
        var $9=((($8))|0)==60;
        if ($9) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $10
        var $11=HEAP[$3];
        var $12=((($11))|0)==0;
        if ($12) { __label__ = 2; break; } else { __label__ = 3; break; }
      case 3: // $13
        var $14=HEAP[$3];
        var $15=(($14) - 1)&4294967295;
        var $16=HEAP[$2];
        var $17=($16)&4294967295;
        var $18=HEAP[$17];
        var $19=($18+$15)&4294967295;
        var $20=HEAP[$19];
        var $21=_word_boundary($20);
        var $22=((($21))|0)!=0;
        if ($22) { __label__ = 4; break; } else { __label__ = 2; break; }
      case 2: // $23
        HEAP[$1]=0;
        __label__ = 5; break;
      case 4: // $24
        var $25=HEAP[$4];
        var $26=($25+1)&4294967295;
        HEAP[$4]=$26;
        __label__ = 1; break;
      case 1: // $27
        var $28=HEAP[$3];
        HEAP[$i]=$28;
        __label__ = 6; break;
      case 6: // $29
        var $30=HEAP[$i];
        var $31=HEAP[$2];
        var $32=($31+4)&4294967295;
        var $33=HEAP[$32];
        var $34=unSign(($30), 32, 0) < unSign(($33), 32, 0);
        if ($34) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $35
        var $36=HEAP[$i];
        var $37=HEAP[$2];
        var $38=($37)&4294967295;
        var $39=HEAP[$38];
        var $40=($39+$36)&4294967295;
        var $41=HEAP[$40];
        var $42=reSign(($41), 8, 0);
        var $43=_tolower($42);
        var $44=((($43)) & 255);
        HEAP[$c]=$44;
        var $45=HEAP[$4];
        var $46=($45+1)&4294967295;
        HEAP[$4]=$46;
        var $47=HEAP[$45];
        HEAP[$p]=$47;
        var $48=HEAP[$p];
        var $49=reSign(($48), 8, 0);
        var $50=((($49))|0)==0;
        if ($50) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $51
        HEAP[$1]=1;
        __label__ = 5; break;
      case 10: // $52
        var $53=HEAP[$p];
        var $54=reSign(($53), 8, 0);
        var $55=((($54))|0)==62;
        if ($55) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $56
        var $57=HEAP[$c];
        var $58=_word_boundary($57);
        HEAP[$1]=$58;
        __label__ = 5; break;
      case 12: // $59
        var $60=HEAP[$c];
        var $61=reSign(($60), 8, 0);
        var $62=HEAP[$p];
        var $63=reSign(($62), 8, 0);
        var $64=((($61))|0)!=((($63))|0);
        if ($64) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $65
        HEAP[$1]=0;
        __label__ = 5; break;
      case 14: // $66
        __label__ = 15; break;
      case 15: // $67
        var $68=HEAP[$i];
        var $69=(($68) + 1)&4294967295;
        HEAP[$i]=$69;
        __label__ = 6; break;
      case 8: // $70
        var $71=HEAP[$4];
        var $72=HEAP[$71];
        var $73=reSign(($72), 8, 0);
        var $74=((($73))|0)==62;
        var $75=unSign(($74), 1, 0);
        HEAP[$1]=$75;
        __label__ = 5; break;
      case 5: // $76
        var $77=HEAP[$1];
        STACKTOP = __stackBase__;
        return $77;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _smartypants_quotes($ob, $text, $i, $is_open) {
    var __stackBase__  = STACKTOP; STACKTOP += 28; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 28);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $4=__stackBase__+12;
        var $5=__stackBase__+16;
        var $ent=__stackBase__+20;
        HEAP[$2]=$ob;
        HEAP[$3]=$text;
        HEAP[$4]=$i;
        HEAP[$5]=$is_open;
        var $6=HEAP[$5];
        var $7=((($6))|0)!=0;
        if ($7) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $8
        var $9=HEAP[$4];
        var $10=(($9) + 1)&4294967295;
        var $11=HEAP[$3];
        var $12=($11+4)&4294967295;
        var $13=HEAP[$12];
        var $14=unSign(($10), 32, 0) < unSign(($13), 32, 0);
        if ($14) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 2: // $15
        var $16=HEAP[$4];
        var $17=(($16) + 1)&4294967295;
        var $18=HEAP[$3];
        var $19=($18)&4294967295;
        var $20=HEAP[$19];
        var $21=($20+$17)&4294967295;
        var $22=HEAP[$21];
        var $23=_word_boundary($22);
        var $24=((($23))|0)!=0;
        if ($24) { __label__ = 1; break; } else { __label__ = 3; break; }
      case 3: // $25
        HEAP[$1]=0;
        __label__ = 4; break;
      case 1: // $26
        var $27=HEAP[$5];
        var $28=((($27))|0)!=0;
        if ($28) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 6: // $29
        var $30=HEAP[$4];
        var $31=unSign(($30), 32, 0) > 0;
        if ($31) { __label__ = 7; break; } else { __label__ = 5; break; }
      case 7: // $32
        var $33=HEAP[$4];
        var $34=(($33) - 1)&4294967295;
        var $35=HEAP[$3];
        var $36=($35)&4294967295;
        var $37=HEAP[$36];
        var $38=($37+$34)&4294967295;
        var $39=HEAP[$38];
        var $40=_word_boundary($39);
        var $41=((($40))|0)!=0;
        if ($41) { __label__ = 5; break; } else { __label__ = 8; break; }
      case 8: // $42
        HEAP[$1]=0;
        __label__ = 4; break;
      case 5: // $43
        var $44=($ent)&4294967295;
        var $45=HEAP[$5];
        var $46=((($45))|0)!=0;
        var $47=($46) ? 114 : 108;
        var $48=HEAP[$4];
        var $49=HEAP[$3];
        var $50=($49)&4294967295;
        var $51=HEAP[$50];
        var $52=($51+$48)&4294967295;
        var $53=HEAP[$52];
        var $54=reSign(($53), 8, 0);
        var $55=((($54))|0)==39;
        var $56=($55) ? 115 : 100;
        var $57=_snprintf($44, 8, (__str432)&4294967295, $47, $56);
        var $58=HEAP[$2];
        var $59=($ent)&4294967295;
        _bufputs($58, $59);
        HEAP[$1]=1;
        __label__ = 4; break;
      case 4: // $60
        var $61=HEAP[$1];
        STACKTOP = __stackBase__;
        return $61;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _put_scaped_char($ob, $c) {
    var __stackBase__  = STACKTOP; STACKTOP += 9; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 9);
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        HEAP[$2]=$ob;
        HEAP[$3]=$c;
        var $4=HEAP[$3];
        var $5=reSign(($4), 8, 0);
        if ($5 == 60) {
          __label__ = 1; break;
        }
        else if ($5 == 62) {
          __label__ = 2; break;
        }
        else if ($5 == 38) {
          __label__ = 3; break;
        }
        else if ($5 == 34) {
          __label__ = 4; break;
        }
        else {
        __label__ = 5; break;
        }
        
      case 1: // $6
        var $7=HEAP[$2];
        _bufput($7, (__str28)&4294967295, 4);
        HEAP[$1]=1;
        __label__ = 0; break;
      case 2: // $8
        var $9=HEAP[$2];
        _bufput($9, (__str129)&4294967295, 4);
        HEAP[$1]=1;
        __label__ = 0; break;
      case 3: // $10
        var $11=HEAP[$2];
        _bufput($11, (__str230)&4294967295, 5);
        HEAP[$1]=1;
        __label__ = 0; break;
      case 4: // $12
        var $13=HEAP[$2];
        _bufput($13, (__str331)&4294967295, 6);
        HEAP[$1]=1;
        __label__ = 0; break;
      case 5: // $14
        HEAP[$1]=0;
        __label__ = 0; break;
      case 0: // $15
        var $16=HEAP[$1];
        STACKTOP = __stackBase__;
        return $16;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _word_boundary($c) {
    var __stackBase__  = STACKTOP; STACKTOP += 1; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 1);
    var __label__;
    var __lastLabel__ = null;
    __label__ = 0; 
    while(1) switch(__label__) {
      case 0: // $0
        var $1=__stackBase__;
        HEAP[$1]=$c;
        var $2=HEAP[$1];
        var $3=reSign(($2), 8, 0);
        var $4=_isspace57($3);
        var $5=((($4))|0)!=0;
        if ($5) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 2: // $6
        var $7=HEAP[$1];
        var $8=reSign(($7), 8, 0);
        var $9=_ispunct58($8);
        var $10=((($9))|0)!=0;
        __lastLabel__ = 2; __label__ = 1; break;
      case 1: // $11
        var $12=__lastLabel__ == 0 ? 1 : ($10);
        var $13=unSign(($12), 1, 0);
        STACKTOP = __stackBase__;
        return $13;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _isspace57($_c) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 4);
    var __label__;
  
    var $1=__stackBase__;
    HEAP[$1]=$_c;
    var $2=HEAP[$1];
    var $3=___istype59($2, 16384);
    STACKTOP = __stackBase__;
    return $3;
  }
  

  function _ispunct58($_c) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 4);
    var __label__;
  
    var $1=__stackBase__;
    HEAP[$1]=$_c;
    var $2=HEAP[$1];
    var $3=___istype59($2, 8192);
    STACKTOP = __stackBase__;
    return $3;
  }
  

  function ___istype59($_c, $_f) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 8);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        HEAP[$1]=$_c;
        HEAP[$2]=$_f;
        var $3=HEAP[$1];
        var $4=_isascii60($3);
        var $5=((($4))|0)!=0;
        if ($5) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $6
        var $7=HEAP[$1];
        var $8=((__DefaultRuneLocale+52)&4294967295+$7*4)&4294967295;
        var $9=HEAP[$8];
        var $10=HEAP[$2];
        var $11=($9) & ($10);
        var $12=((($11))|0)!=0;
        var $13=($12) ^ 1;
        var $14=($13) ^ 1;
        var $15=unSign(($14), 1, 0);
        __lastLabel__ = 0; __label__ = 2; break;
      case 1: // $16
        var $17=HEAP[$1];
        var $18=HEAP[$2];
        var $19=___maskrune($17, $18);
        var $20=((($19))|0)!=0;
        var $21=($20) ^ 1;
        var $22=($21) ^ 1;
        var $23=unSign(($22), 1, 0);
        __lastLabel__ = 1; __label__ = 2; break;
      case 2: // $24
        var $25=__lastLabel__ == 0 ? $15 : ($23);
        STACKTOP = __stackBase__;
        return $25;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _isascii60($_c) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 4);
    var __label__;
  
    var $1=__stackBase__;
    HEAP[$1]=$_c;
    var $2=HEAP[$1];
    var $3=($2) & -128;
    var $4=((($3))|0)==0;
    var $5=unSign(($4), 1, 0);
    STACKTOP = __stackBase__;
    return $5;
  }
  

  function _tolower($_c) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 4);
    var __label__;
  
    var $1=__stackBase__;
    HEAP[$1]=$_c;
    var $2=HEAP[$1];
    var $3=___tolower($2);
    STACKTOP = __stackBase__;
    return $3;
  }
  

  function _lus_attr_escape($ob, $src, $size) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 20);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $i=__stackBase__+12;
        var $org=__stackBase__+16;
        HEAP[$1]=$ob;
        HEAP[$2]=$src;
        HEAP[$3]=$size;
        HEAP[$i]=0;
        __label__ = 0; break;
      case 0: // $4
        var $5=HEAP[$i];
        var $6=HEAP[$3];
        var $7=unSign(($5), 32, 0) < unSign(($6), 32, 0);
        if ($7) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $8
        var $9=HEAP[$i];
        HEAP[$org]=$9;
        __label__ = 3; break;
      case 3: // $10
        var $11=HEAP[$i];
        var $12=HEAP[$3];
        var $13=unSign(($11), 32, 0) < unSign(($12), 32, 0);
        if ($13) { __lastLabel__ = 3; __label__ = 4; break; } else { __lastLabel__ = 3; __label__ = 5; break; }
      case 4: // $14
        var $15=HEAP[$i];
        var $16=HEAP[$2];
        var $17=($16+$15)&4294967295;
        var $18=HEAP[$17];
        var $19=reSign(($18), 8, 0);
        var $20=((($19))|0)!=60;
        if ($20) { __lastLabel__ = 4; __label__ = 6; break; } else { __lastLabel__ = 4; __label__ = 5; break; }
      case 6: // $21
        var $22=HEAP[$i];
        var $23=HEAP[$2];
        var $24=($23+$22)&4294967295;
        var $25=HEAP[$24];
        var $26=reSign(($25), 8, 0);
        var $27=((($26))|0)!=62;
        if ($27) { __lastLabel__ = 6; __label__ = 7; break; } else { __lastLabel__ = 6; __label__ = 5; break; }
      case 7: // $28
        var $29=HEAP[$i];
        var $30=HEAP[$2];
        var $31=($30+$29)&4294967295;
        var $32=HEAP[$31];
        var $33=reSign(($32), 8, 0);
        var $34=((($33))|0)!=38;
        if ($34) { __lastLabel__ = 7; __label__ = 8; break; } else { __lastLabel__ = 7; __label__ = 5; break; }
      case 8: // $35
        var $36=HEAP[$i];
        var $37=HEAP[$2];
        var $38=($37+$36)&4294967295;
        var $39=HEAP[$38];
        var $40=reSign(($39), 8, 0);
        var $41=((($40))|0)!=34;
        __lastLabel__ = 8; __label__ = 5; break;
      case 5: // $42
        var $43=__lastLabel__ == 7 ? 0 : (__lastLabel__ == 6 ? 0 : (__lastLabel__ == 4 ? 0 : (__lastLabel__ == 3 ? 0 : ($41))));
        if ($43) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $44
        var $45=HEAP[$i];
        var $46=(($45) + 1)&4294967295;
        HEAP[$i]=$46;
        __label__ = 3; break;
      case 10: // $47
        var $48=HEAP[$i];
        var $49=HEAP[$org];
        var $50=unSign(($48), 32, 0) > unSign(($49), 32, 0);
        if ($50) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $51
        var $52=HEAP[$1];
        var $53=HEAP[$2];
        var $54=HEAP[$org];
        var $55=($53+$54)&4294967295;
        var $56=HEAP[$i];
        var $57=HEAP[$org];
        var $58=(($56) - ($57))&4294967295;
        _bufput($52, $55, $58);
        __label__ = 12; break;
      case 12: // $59
        var $60=HEAP[$i];
        var $61=HEAP[$3];
        var $62=unSign(($60), 32, 0) >= unSign(($61), 32, 0);
        if ($62) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $63
        __label__ = 2; break;
      case 14: // $64
        var $65=HEAP[$1];
        var $66=HEAP[$i];
        var $67=HEAP[$2];
        var $68=($67+$66)&4294967295;
        var $69=HEAP[$68];
        var $70=_put_scaped_char($65, $69);
        var $71=HEAP[$i];
        var $72=(($71) + 1)&4294967295;
        HEAP[$i]=$72;
        __label__ = 0; break;
      case 2: // $73
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _is_html_tag($tag, $tagname) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 16);
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // _entry
        var $1=__stackBase__;
        var $2=__stackBase__+4;
        var $3=__stackBase__+8;
        var $i=__stackBase__+12;
        HEAP[$2]=$tag;
        HEAP[$3]=$tagname;
        HEAP[$i]=0;
        var $4=HEAP[$i];
        var $5=HEAP[$2];
        var $6=($5+4)&4294967295;
        var $7=HEAP[$6];
        var $8=unSign(($4), 32, 0) < unSign(($7), 32, 0);
        if ($8) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $9
        var $10=HEAP[$2];
        var $11=($10)&4294967295;
        var $12=HEAP[$11];
        var $13=($12)&4294967295;
        var $14=HEAP[$13];
        var $15=reSign(($14), 8, 0);
        var $16=((($15))|0)!=60;
        if ($16) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 2: // $17
        HEAP[$1]=0;
        __label__ = 3; break;
      case 1: // $18
        var $19=HEAP[$i];
        var $20=(($19) + 1)&4294967295;
        HEAP[$i]=$20;
        __label__ = 4; break;
      case 4: // $21
        var $22=HEAP[$i];
        var $23=HEAP[$2];
        var $24=($23+4)&4294967295;
        var $25=HEAP[$24];
        var $26=unSign(($22), 32, 0) < unSign(($25), 32, 0);
        if ($26) { __lastLabel__ = 4; __label__ = 5; break; } else { __lastLabel__ = 4; __label__ = 6; break; }
      case 5: // $27
        var $28=HEAP[$i];
        var $29=HEAP[$2];
        var $30=($29)&4294967295;
        var $31=HEAP[$30];
        var $32=($31+$28)&4294967295;
        var $33=HEAP[$32];
        var $34=reSign(($33), 8, 0);
        var $35=_isspace57($34);
        var $36=((($35))|0)!=0;
        __lastLabel__ = 5; __label__ = 6; break;
      case 6: // $37
        var $38=__lastLabel__ == 4 ? 0 : ($36);
        if ($38) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $39
        var $40=HEAP[$i];
        var $41=(($40) + 1)&4294967295;
        HEAP[$i]=$41;
        __label__ = 4; break;
      case 8: // $42
        var $43=HEAP[$i];
        var $44=HEAP[$2];
        var $45=($44+4)&4294967295;
        var $46=HEAP[$45];
        var $47=unSign(($43), 32, 0) < unSign(($46), 32, 0);
        if ($47) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $48
        var $49=HEAP[$i];
        var $50=HEAP[$2];
        var $51=($50)&4294967295;
        var $52=HEAP[$51];
        var $53=($52+$49)&4294967295;
        var $54=HEAP[$53];
        var $55=reSign(($54), 8, 0);
        var $56=((($55))|0)==47;
        if ($56) { __label__ = 11; break; } else { __label__ = 10; break; }
      case 11: // $57
        var $58=HEAP[$i];
        var $59=(($58) + 1)&4294967295;
        HEAP[$i]=$59;
        __label__ = 10; break;
      case 10: // $60
        __label__ = 12; break;
      case 12: // $61
        var $62=HEAP[$i];
        var $63=HEAP[$2];
        var $64=($63+4)&4294967295;
        var $65=HEAP[$64];
        var $66=unSign(($62), 32, 0) < unSign(($65), 32, 0);
        if ($66) { __lastLabel__ = 12; __label__ = 13; break; } else { __lastLabel__ = 12; __label__ = 14; break; }
      case 13: // $67
        var $68=HEAP[$i];
        var $69=HEAP[$2];
        var $70=($69)&4294967295;
        var $71=HEAP[$70];
        var $72=($71+$68)&4294967295;
        var $73=HEAP[$72];
        var $74=reSign(($73), 8, 0);
        var $75=_isspace57($74);
        var $76=((($75))|0)!=0;
        __lastLabel__ = 13; __label__ = 14; break;
      case 14: // $77
        var $78=__lastLabel__ == 12 ? 0 : ($76);
        if ($78) { __label__ = 15; break; } else { __label__ = 16; break; }
      case 15: // $79
        var $80=HEAP[$i];
        var $81=(($80) + 1)&4294967295;
        HEAP[$i]=$81;
        __label__ = 12; break;
      case 16: // $82
        __label__ = 17; break;
      case 17: // $83
        var $84=HEAP[$i];
        var $85=HEAP[$2];
        var $86=($85+4)&4294967295;
        var $87=HEAP[$86];
        var $88=unSign(($84), 32, 0) < unSign(($87), 32, 0);
        if ($88) { __label__ = 18; break; } else { __label__ = 19; break; }
      case 18: // $89
        var $90=HEAP[$3];
        var $91=HEAP[$90];
        var $92=reSign(($91), 8, 0);
        var $93=((($92))|0)==0;
        if ($93) { __label__ = 20; break; } else { __label__ = 21; break; }
      case 20: // $94
        __label__ = 19; break;
      case 21: // $95
        var $96=HEAP[$i];
        var $97=HEAP[$2];
        var $98=($97)&4294967295;
        var $99=HEAP[$98];
        var $100=($99+$96)&4294967295;
        var $101=HEAP[$100];
        var $102=reSign(($101), 8, 0);
        var $103=HEAP[$3];
        var $104=HEAP[$103];
        var $105=reSign(($104), 8, 0);
        var $106=((($102))|0)!=((($105))|0);
        if ($106) { __label__ = 22; break; } else { __label__ = 23; break; }
      case 22: // $107
        HEAP[$1]=0;
        __label__ = 3; break;
      case 23: // $108
        __label__ = 24; break;
      case 24: // $109
        var $110=HEAP[$i];
        var $111=(($110) + 1)&4294967295;
        HEAP[$i]=$111;
        var $112=HEAP[$3];
        var $113=($112+1)&4294967295;
        HEAP[$3]=$113;
        __label__ = 17; break;
      case 19: // $114
        var $115=HEAP[$i];
        var $116=HEAP[$2];
        var $117=($116+4)&4294967295;
        var $118=HEAP[$117];
        var $119=((($115))|0)==((($118))|0);
        if ($119) { __label__ = 25; break; } else { __label__ = 26; break; }
      case 25: // $120
        HEAP[$1]=0;
        __label__ = 3; break;
      case 26: // $121
        var $122=HEAP[$i];
        var $123=HEAP[$2];
        var $124=($123)&4294967295;
        var $125=HEAP[$124];
        var $126=($125+$122)&4294967295;
        var $127=HEAP[$126];
        var $128=reSign(($127), 8, 0);
        var $129=_isspace57($128);
        var $130=((($129))|0)!=0;
        if ($130) { __lastLabel__ = 26; __label__ = 27; break; } else { __lastLabel__ = 26; __label__ = 28; break; }
      case 28: // $131
        var $132=HEAP[$i];
        var $133=HEAP[$2];
        var $134=($133)&4294967295;
        var $135=HEAP[$134];
        var $136=($135+$132)&4294967295;
        var $137=HEAP[$136];
        var $138=reSign(($137), 8, 0);
        var $139=((($138))|0)==62;
        __lastLabel__ = 28; __label__ = 27; break;
      case 27: // $140
        var $141=__lastLabel__ == 26 ? 1 : ($139);
        var $142=unSign(($141), 1, 0);
        HEAP[$1]=$142;
        __label__ = 3; break;
      case 3: // $143
        var $144=HEAP[$1];
        STACKTOP = __stackBase__;
        return $144;
      default: assert(0, "bad label: " + __label__);
    }
  }
  

  function _JSUPS_parse($text) {
    var __stackBase__  = STACKTOP; STACKTOP += 128; assert(STACKTOP < STACK_MAX); _memset(__stackBase__, 0, 128);
    var __label__;
  
    var $1=__stackBase__;
    var $renderer=__stackBase__+4;
    var $ib=__stackBase__+104;
    var $ob=__stackBase__+124;
    HEAP[$1]=$text;
    var $2=$ib;
    _llvm_memset_p0i8_i32($2, 0, 20, 4, 0);
    var $3=HEAP[$1];
    var $4=($ib)&4294967295;
    HEAP[$4]=$3;
    var $5=HEAP[$1];
    var $6=_strlen($5);
    var $7=($ib+4)&4294967295;
    HEAP[$7]=$6;
    var $8=_bufnew(64);
    HEAP[$ob]=$8;
    _ups_xhtml_renderer($renderer, 0);
    var $9=HEAP[$ob];
    _ups_markdown($9, $ib, $renderer, 255);
    _ups_free_renderer($renderer);
    var $10=HEAP[$ob];
    var $11=($10+4)&4294967295;
    var $12=HEAP[$11];
    var $13=HEAP[$ob];
    var $14=($13)&4294967295;
    var $15=HEAP[$14];
    var $16=($15+$12)&4294967295;
    HEAP[$16]=0;
    var $17=HEAP[$ob];
    var $18=($17)&4294967295;
    var $19=HEAP[$18];
    STACKTOP = __stackBase__;
    return $19;
  }
  
var FUNCTION_TABLE = [0,0,_char_emphasis,0,_char_codespan,0,_char_linebreak,0,_char_link,0,_char_langle_tag,0,_char_escape,0,_char_entity,0,_char_autolink,0,_cmp_link_ref_sort,0,_cmp_link_ref,0,_cmp_html_tag,0,_rndr_smartypants,0,_toc_header,0,_rndr_codespan,0,_rndr_double_emphasis,0,_rndr_emphasis,0,_rndr_triple_emphasis,0,_toc_finalize,0,_rndr_blockcode,0,_rndr_blockquote,0,_rndr_raw_block,0,_rndr_header,0,_rndr_hrule,0,_rndr_list,0,_rndr_listitem,0,_rndr_paragraph,0,_rndr_table,0,_rndr_tablerow,0,_rndr_tablecell,0,_rndr_autolink,0,_rndr_image,0,_rndr_linebreak,0,_rndr_link,0,_rndr_raw_html,0,_rndr_normal_text,0];

// === Auto-generated postamble setup entry stuff ===

Module.callMain = function callMain(args) {
  var argc = args.length+1;
  function pad() {
    for (var i = 0; i < 4-1; i++) {
      argv.push(0);
    }
  }
  var argv = [Pointer_make(intArrayFromString("/bin/this.program"), null) ];
  pad();
  for (var i = 0; i < argc-1; i = i + 1) {
    argv.push(Pointer_make(intArrayFromString(args[i]), null));
    pad();
  }
  argv.push(0);
  argv = Pointer_make(argv, null);

  _main(argc, argv, 0);
}

function run(args) {
  __initializeRuntime__();

  var globalFuncs = [];


_is_safe_link_valid_uris_count=Pointer_make([4], 0, ALLOC_STATIC);
_is_safe_link_valid_uris=Pointer_make([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0, ALLOC_STATIC);
__str=Pointer_make([104,116,116,112,58,47,47,0] /* http://\00 */, 0, ALLOC_STATIC);
__str1=Pointer_make([104,116,116,112,115,58,47,47,0] /* https://\00 */, 0, ALLOC_STATIC);
__str2=Pointer_make([102,116,112,58,47,47,0] /* ftp://\00 */, 0, ALLOC_STATIC);
__str3=Pointer_make([109,97,105,108,116,111,58,47,47,0] /* mailto://\00 */, 0, ALLOC_STATIC);
___func___ups_markdown=Pointer_make([117,112,115,95,109,97,114,107,100,111,119,110,0] /* ups_markdown\00 */, 0, ALLOC_STATIC);
__str4=Pointer_make([117,112,115,107,105,114,116,47,115,114,99,47,109,97,114,107,100,111,119,110,46,99,0] /* upskirt/src/markdown */, 0, ALLOC_STATIC);
__str5=Pointer_make([114,110,100,114,46,119,111,114,107,46,115,105,122,101,32,61,61,32,48,0] /* rndr.work.size == 0\ */, 0, ALLOC_STATIC);
_block_tags=Pointer_make([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0], 0, ALLOC_STATIC);
__str6=Pointer_make([112,0] /* p\00 */, 0, ALLOC_STATIC);
__str7=Pointer_make([100,108,0] /* dl\00 */, 0, ALLOC_STATIC);
__str8=Pointer_make([104,49,0] /* h1\00 */, 0, ALLOC_STATIC);
__str9=Pointer_make([104,50,0] /* h2\00 */, 0, ALLOC_STATIC);
__str10=Pointer_make([104,51,0] /* h3\00 */, 0, ALLOC_STATIC);
__str11=Pointer_make([104,52,0] /* h4\00 */, 0, ALLOC_STATIC);
__str12=Pointer_make([104,53,0] /* h5\00 */, 0, ALLOC_STATIC);
__str13=Pointer_make([104,54,0] /* h6\00 */, 0, ALLOC_STATIC);
__str14=Pointer_make([111,108,0] /* ol\00 */, 0, ALLOC_STATIC);
__str15=Pointer_make([117,108,0] /* ul\00 */, 0, ALLOC_STATIC);
__str16=Pointer_make([100,101,108,0] /* del\00 */, 0, ALLOC_STATIC);
__str17=Pointer_make([100,105,118,0] /* div\00 */, 0, ALLOC_STATIC);
__str18=Pointer_make([105,110,115,0] /* ins\00 */, 0, ALLOC_STATIC);
__str19=Pointer_make([112,114,101,0] /* pre\00 */, 0, ALLOC_STATIC);
__str20=Pointer_make([102,111,114,109,0] /* form\00 */, 0, ALLOC_STATIC);
__str21=Pointer_make([109,97,116,104,0] /* math\00 */, 0, ALLOC_STATIC);
__str22=Pointer_make([116,97,98,108,101,0] /* table\00 */, 0, ALLOC_STATIC);
__str23=Pointer_make([105,102,114,97,109,101,0] /* iframe\00 */, 0, ALLOC_STATIC);
__str24=Pointer_make([115,99,114,105,112,116,0] /* script\00 */, 0, ALLOC_STATIC);
__str25=Pointer_make([102,105,101,108,100,115,101,116,0] /* fieldset\00 */, 0, ALLOC_STATIC);
__str26=Pointer_make([110,111,115,99,114,105,112,116,0] /* noscript\00 */, 0, ALLOC_STATIC);
__str27=Pointer_make([98,108,111,99,107,113,117,111,116,101,0] /* blockquote\00 */, 0, ALLOC_STATIC);
_ups_toc_renderer_toc_render=Pointer_make([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 26, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 28, 0, 0, 0, 30, 0, 0, 0, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 34, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 36, 0, 0, 0, 0, 0, 0, 0], 0, ALLOC_STATIC);
_ups_xhtml_renderer_renderer_default=Pointer_make([38, 0, 0, 0, 40, 0, 0, 0, 42, 0, 0, 0, 44, 0, 0, 0, 46, 0, 0, 0, 48, 0, 0, 0, 50, 0, 0, 0, 52, 0, 0, 0, 54, 0, 0, 0, 56, 0, 0, 0, 58, 0, 0, 0, 60, 0, 0, 0, 28, 0, 0, 0, 30, 0, 0, 0, 32, 0, 0, 0, 62, 0, 0, 0, 64, 0, 0, 0, 66, 0, 0, 0, 68, 0, 0, 0, 34, 0, 0, 0, 0, 0, 0, 0, 70, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0, ALLOC_STATIC);
_smartypants_subs=Pointer_make([39, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 39, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 39, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 39, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 39, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 39, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 39, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 45, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 45, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 46, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 46, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 51, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 51, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 49, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 49, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 49, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 38, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], 0, ALLOC_STATIC);
__str28=Pointer_make([38,108,116,59,0] /* &lt;\00 */, 0, ALLOC_STATIC);
__str129=Pointer_make([38,103,116,59,0] /* &gt;\00 */, 0, ALLOC_STATIC);
__str230=Pointer_make([38,97,109,112,59,0] /* &amp;\00 */, 0, ALLOC_STATIC);
__str331=Pointer_make([38,113,117,111,116,59,0] /* &quot;\00 */, 0, ALLOC_STATIC);
__str432=Pointer_make([38,37,99,37,99,113,117,111,59,0] /* &%c%cquo;\00 */, 0, ALLOC_STATIC);
__str533=Pointer_make([39,115,62,0] /* 's>\00 */, 0, ALLOC_STATIC);
__str634=Pointer_make([38,114,115,113,117,111,59,0] /* &rsquo;\00 */, 0, ALLOC_STATIC);
__str735=Pointer_make([39,116,62,0] /* 't>\00 */, 0, ALLOC_STATIC);
__str836=Pointer_make([39,114,101,62,0] /* 're>\00 */, 0, ALLOC_STATIC);
__str937=Pointer_make([39,108,108,62,0] /* 'll>\00 */, 0, ALLOC_STATIC);
__str1038=Pointer_make([39,118,101,62,0] /* 've>\00 */, 0, ALLOC_STATIC);
__str1139=Pointer_make([39,109,62,0] /* 'm>\00 */, 0, ALLOC_STATIC);
__str1240=Pointer_make([39,100,62,0] /* 'd>\00 */, 0, ALLOC_STATIC);
__str1341=Pointer_make([45,45,0] /* --\00 */, 0, ALLOC_STATIC);
__str1442=Pointer_make([38,109,100,97,115,104,59,0] /* &mdash;\00 */, 0, ALLOC_STATIC);
__str1543=Pointer_make([60,45,62,0] /* <->\00 */, 0, ALLOC_STATIC);
__str1644=Pointer_make([38,110,100,97,115,104,59,0] /* &ndash;\00 */, 0, ALLOC_STATIC);
__str1745=Pointer_make([46,46,46,0] /* ...\00 */, 0, ALLOC_STATIC);
__str1846=Pointer_make([38,104,101,108,108,105,112,59,0] /* &hellip;\00 */, 0, ALLOC_STATIC);
__str1947=Pointer_make([46,32,46,32,46,0] /* . . .\00 */, 0, ALLOC_STATIC);
__str2048=Pointer_make([40,99,41,0] /* (c)\00 */, 0, ALLOC_STATIC);
__str2149=Pointer_make([38,99,111,112,121,59,0] /* &copy;\00 */, 0, ALLOC_STATIC);
__str2250=Pointer_make([40,114,41,0] /* (r)\00 */, 0, ALLOC_STATIC);
__str2351=Pointer_make([38,114,101,103,59,0] /* &reg;\00 */, 0, ALLOC_STATIC);
__str2452=Pointer_make([40,116,109,41,0] /* (tm)\00 */, 0, ALLOC_STATIC);
__str2553=Pointer_make([38,116,114,97,100,101,59,0] /* &trade;\00 */, 0, ALLOC_STATIC);
__str2654=Pointer_make([60,51,47,52,62,0] /* <3/4>\00 */, 0, ALLOC_STATIC);
__str2755=Pointer_make([38,102,114,97,99,51,52,59,0] /* &frac34;\00 */, 0, ALLOC_STATIC);
__str2856=Pointer_make([60,51,47,52,116,104,115,62,0] /* <3/4ths>\00 */, 0, ALLOC_STATIC);
__str29=Pointer_make([60,49,47,50,62,0] /* <1/2>\00 */, 0, ALLOC_STATIC);
__str30=Pointer_make([38,102,114,97,99,49,50,59,0] /* &frac12;\00 */, 0, ALLOC_STATIC);
__str31=Pointer_make([60,49,47,52,62,0] /* <1/4>\00 */, 0, ALLOC_STATIC);
__str32=Pointer_make([38,102,114,97,99,49,52,59,0] /* &frac14;\00 */, 0, ALLOC_STATIC);
__str33=Pointer_make([60,49,47,52,116,104,62,0] /* <1/4th>\00 */, 0, ALLOC_STATIC);
__str34=Pointer_make([38,35,48,59,0] /* &#0;\00 */, 0, ALLOC_STATIC);
__str35=Pointer_make([115,116,121,108,101,0] /* style\00 */, 0, ALLOC_STATIC);
__str36=Pointer_make([97,0] /* a\00 */, 0, ALLOC_STATIC);
__str37=Pointer_make([105,109,103,0] /* img\00 */, 0, ALLOC_STATIC);
__str38=Pointer_make([60,97,32,104,114,101,102,61,34,0] /* <a href=\22\00 */, 0, ALLOC_STATIC);
__str39=Pointer_make([34,32,116,105,116,108,101,61,34,0] /* \22 title=\22\00 */, 0, ALLOC_STATIC);
__str40=Pointer_make([34,62,0] /* \22>\00 */, 0, ALLOC_STATIC);
__str41=Pointer_make([60,47,97,62,0] /* </a>\00 */, 0, ALLOC_STATIC);
__str42=Pointer_make([60,98,114,32,47,62,10,0] /* <br />\0A\00 */, 0, ALLOC_STATIC);
__str43=Pointer_make([60,105,109,103,32,115,114,99,61,34,0] /* <img src=\22\00 */, 0, ALLOC_STATIC);
__str44=Pointer_make([34,32,97,108,116,61,34,0] /* \22 alt=\22\00 */, 0, ALLOC_STATIC);
__str45=Pointer_make([34,32,47,62,0] /* \22 />\00 */, 0, ALLOC_STATIC);
__str46=Pointer_make([109,97,105,108,116,111,58,0] /* mailto:\00 */, 0, ALLOC_STATIC);
__str47=Pointer_make([60,116,100,32,97,108,105,103,110,61,34,108,101,102,116,34,62,0] /* <td align=\22left\22 */, 0, ALLOC_STATIC);
__str48=Pointer_make([60,116,100,32,97,108,105,103,110,61,34,114,105,103,104,116,34,62,0] /* <td align=\22right\2 */, 0, ALLOC_STATIC);
__str49=Pointer_make([60,116,100,32,97,108,105,103,110,61,34,99,101,110,116,101,114,34,62,0] /* <td align=\22center\ */, 0, ALLOC_STATIC);
__str50=Pointer_make([60,116,100,62,0] /* <td>\00 */, 0, ALLOC_STATIC);
__str51=Pointer_make([60,47,116,100,62,0] /* </td>\00 */, 0, ALLOC_STATIC);
__str52=Pointer_make([60,116,114,62,10,0] /* <tr>\0A\00 */, 0, ALLOC_STATIC);
__str53=Pointer_make([10,60,47,116,114,62,0] /* \0A</tr>\00 */, 0, ALLOC_STATIC);
__str54=Pointer_make([60,116,97,98,108,101,62,60,116,104,101,97,100,62,10,0] /* <table><thead>\0A\00 */, 0, ALLOC_STATIC);
__str55=Pointer_make([10,60,47,116,104,101,97,100,62,60,116,98,111,100,121,62,10,0] /* \0A</thead><tbody>\0 */, 0, ALLOC_STATIC);
__str56=Pointer_make([10,60,47,116,98,111,100,121,62,60,47,116,97,98,108,101,62,0] /* \0A</tbody></table>\ */, 0, ALLOC_STATIC);
__str57=Pointer_make([60,112,62,0] /* <p>\00 */, 0, ALLOC_STATIC);
__str58=Pointer_make([60,98,114,47,62,10,0] /* <br/>\0A\00 */, 0, ALLOC_STATIC);
__str59=Pointer_make([60,47,112,62,10,0] /* </p>\0A\00 */, 0, ALLOC_STATIC);
__str60=Pointer_make([60,108,105,62,0] /* <li>\00 */, 0, ALLOC_STATIC);
__str61=Pointer_make([60,47,108,105,62,10,0] /* </li>\0A\00 */, 0, ALLOC_STATIC);
__str62=Pointer_make([60,111,108,62,10,0] /* <ol>\0A\00 */, 0, ALLOC_STATIC);
__str63=Pointer_make([60,117,108,62,10,0] /* <ul>\0A\00 */, 0, ALLOC_STATIC);
__str64=Pointer_make([60,47,111,108,62,10,0] /* </ol>\0A\00 */, 0, ALLOC_STATIC);
__str65=Pointer_make([60,47,117,108,62,10,0] /* </ul>\0A\00 */, 0, ALLOC_STATIC);
__str66=Pointer_make([60,104,114,32,47,62,10,0] /* <hr />\0A\00 */, 0, ALLOC_STATIC);
__str67=Pointer_make([60,97,32,110,97,109,101,61,34,116,111,99,95,37,100,34,62,60,47,97,62,0] /* <a name=\22toc_%d\22 */, 0, ALLOC_STATIC);
__str68=Pointer_make([60,104,37,100,62,0] /* <h%d>\00 */, 0, ALLOC_STATIC);
__str69=Pointer_make([60,47,104,37,100,62,10,0] /* </h%d>\0A\00 */, 0, ALLOC_STATIC);
__str70=Pointer_make([60,98,108,111,99,107,113,117,111,116,101,62,10,0] /* <blockquote>\0A\00 */, 0, ALLOC_STATIC);
__str71=Pointer_make([60,47,98,108,111,99,107,113,117,111,116,101,62,0] /* </blockquote>\00 */, 0, ALLOC_STATIC);
__str72=Pointer_make([60,112,114,101,32,108,97,110,103,61,34,0] /* <pre lang=\22\00 */, 0, ALLOC_STATIC);
__str73=Pointer_make([34,62,60,99,111,100,101,62,0] /* \22><code>\00 */, 0, ALLOC_STATIC);
__str74=Pointer_make([60,112,114,101,62,60,99,111,100,101,62,0] /* <pre><code>\00 */, 0, ALLOC_STATIC);
__str75=Pointer_make([60,47,99,111,100,101,62,60,47,112,114,101,62,10,0] /* </code></pre>\0A\00 */, 0, ALLOC_STATIC);
__str76=Pointer_make([60,47,117,108,62,60,47,108,105,62,10,0] /* </ul></li>\0A\00 */, 0, ALLOC_STATIC);
__str77=Pointer_make([60,115,116,114,111,110,103,62,60,101,109,62,0] /* <strong><em>\00 */, 0, ALLOC_STATIC);
__str78=Pointer_make([60,47,101,109,62,60,47,115,116,114,111,110,103,62,0] /* </em></strong>\00 */, 0, ALLOC_STATIC);
__str79=Pointer_make([60,101,109,62,0] /* <em>\00 */, 0, ALLOC_STATIC);
__str80=Pointer_make([60,47,101,109,62,0] /* </em>\00 */, 0, ALLOC_STATIC);
__str81=Pointer_make([60,100,101,108,62,0] /* <del>\00 */, 0, ALLOC_STATIC);
__str82=Pointer_make([60,47,100,101,108,62,0] /* </del>\00 */, 0, ALLOC_STATIC);
__str83=Pointer_make([60,115,116,114,111,110,103,62,0] /* <strong>\00 */, 0, ALLOC_STATIC);
__str84=Pointer_make([60,47,115,116,114,111,110,103,62,0] /* </strong>\00 */, 0, ALLOC_STATIC);
__str85=Pointer_make([60,99,111,100,101,62,0] /* <code>\00 */, 0, ALLOC_STATIC);
__str86=Pointer_make([60,47,99,111,100,101,62,0] /* </code>\00 */, 0, ALLOC_STATIC);
__str87=Pointer_make([60,47,117,108,62,0] /* </ul>\00 */, 0, ALLOC_STATIC);
__str88=Pointer_make([60,108,105,62,60,97,32,104,114,101,102,61,34,35,116,111,99,95,37,100,34,62,0] /* <li><a href=\22#toc_ */, 0, ALLOC_STATIC);
__str89=Pointer_make([60,47,97,62,60,47,108,105,62,10,0] /* </a></li>\0A\00 */, 0, ALLOC_STATIC);
IHEAP[_is_safe_link_valid_uris] = (__str)&4294967295;
IHEAP[_is_safe_link_valid_uris+4] = (__str1)&4294967295;
IHEAP[_is_safe_link_valid_uris+8] = (__str2)&4294967295;
IHEAP[_is_safe_link_valid_uris+12] = (__str3)&4294967295;
IHEAP[_block_tags] = (__str6)&4294967295;
IHEAP[_block_tags+8] = (__str7)&4294967295;
IHEAP[_block_tags+16] = (__str8)&4294967295;
IHEAP[_block_tags+24] = (__str9)&4294967295;
IHEAP[_block_tags+32] = (__str10)&4294967295;
IHEAP[_block_tags+40] = (__str11)&4294967295;
IHEAP[_block_tags+48] = (__str12)&4294967295;
IHEAP[_block_tags+56] = (__str13)&4294967295;
IHEAP[_block_tags+64] = (__str14)&4294967295;
IHEAP[_block_tags+72] = (__str15)&4294967295;
IHEAP[_block_tags+80] = (__str16)&4294967295;
IHEAP[_block_tags+88] = (__str17)&4294967295;
IHEAP[_block_tags+96] = (__str18)&4294967295;
IHEAP[_block_tags+104] = (__str19)&4294967295;
IHEAP[_block_tags+112] = (__str20)&4294967295;
IHEAP[_block_tags+120] = (__str21)&4294967295;
IHEAP[_block_tags+128] = (__str22)&4294967295;
IHEAP[_block_tags+136] = (__str23)&4294967295;
IHEAP[_block_tags+144] = (__str24)&4294967295;
IHEAP[_block_tags+152] = (__str25)&4294967295;
IHEAP[_block_tags+160] = (__str26)&4294967295;
IHEAP[_block_tags+168] = (__str27)&4294967295;
IHEAP[_smartypants_subs+4] = (__str533)&4294967295;
IHEAP[_smartypants_subs+8] = (__str634)&4294967295;
IHEAP[_smartypants_subs+20] = (__str735)&4294967295;
IHEAP[_smartypants_subs+24] = (__str634)&4294967295;
IHEAP[_smartypants_subs+36] = (__str836)&4294967295;
IHEAP[_smartypants_subs+40] = (__str634)&4294967295;
IHEAP[_smartypants_subs+52] = (__str937)&4294967295;
IHEAP[_smartypants_subs+56] = (__str634)&4294967295;
IHEAP[_smartypants_subs+68] = (__str1038)&4294967295;
IHEAP[_smartypants_subs+72] = (__str634)&4294967295;
IHEAP[_smartypants_subs+84] = (__str1139)&4294967295;
IHEAP[_smartypants_subs+88] = (__str634)&4294967295;
IHEAP[_smartypants_subs+100] = (__str1240)&4294967295;
IHEAP[_smartypants_subs+104] = (__str634)&4294967295;
IHEAP[_smartypants_subs+116] = (__str1341)&4294967295;
IHEAP[_smartypants_subs+120] = (__str1442)&4294967295;
IHEAP[_smartypants_subs+132] = (__str1543)&4294967295;
IHEAP[_smartypants_subs+136] = (__str1644)&4294967295;
IHEAP[_smartypants_subs+148] = (__str1745)&4294967295;
IHEAP[_smartypants_subs+152] = (__str1846)&4294967295;
IHEAP[_smartypants_subs+164] = (__str1947)&4294967295;
IHEAP[_smartypants_subs+168] = (__str1846)&4294967295;
IHEAP[_smartypants_subs+180] = (__str2048)&4294967295;
IHEAP[_smartypants_subs+184] = (__str2149)&4294967295;
IHEAP[_smartypants_subs+196] = (__str2250)&4294967295;
IHEAP[_smartypants_subs+200] = (__str2351)&4294967295;
IHEAP[_smartypants_subs+212] = (__str2452)&4294967295;
IHEAP[_smartypants_subs+216] = (__str2553)&4294967295;
IHEAP[_smartypants_subs+228] = (__str2654)&4294967295;
IHEAP[_smartypants_subs+232] = (__str2755)&4294967295;
IHEAP[_smartypants_subs+244] = (__str2856)&4294967295;
IHEAP[_smartypants_subs+248] = (__str2755)&4294967295;
IHEAP[_smartypants_subs+260] = (__str29)&4294967295;
IHEAP[_smartypants_subs+264] = (__str30)&4294967295;
IHEAP[_smartypants_subs+276] = (__str31)&4294967295;
IHEAP[_smartypants_subs+280] = (__str32)&4294967295;
IHEAP[_smartypants_subs+292] = (__str33)&4294967295;
IHEAP[_smartypants_subs+296] = (__str32)&4294967295;
IHEAP[_smartypants_subs+308] = (__str34)&4294967295;
_STDIO.init()


  __globalConstructor__();

  if (Module['_main']) {
    Module.callMain(args);
    __shutdownRuntime__();
  }
}
Module['run'] = run;

// {{PRE_RUN_ADDITIONS}}

run(args);

// {{POST_RUN_ADDITIONS}}





  // {{MODULE_ADDITIONS}}

//  return Module;
//})({}, this.arguments); // Replace parameters as needed



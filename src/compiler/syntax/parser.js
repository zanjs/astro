// _ = 1
// opt = ?
// optmore = *
// more = +
// _('ab', '*')._('name', '+')
const { print } = require('../utils');


// String | Function | RegExp
class Parser {
  constructor(payload) {
    this.payload = payload;
  }

  peek(offset) {
    const { code, curPos } = this.payload;
    if (curPos + offset + 1 > code.length) {
      return { success: false, value: null };
    }
    return { success: true, value: code.slice(curPos + 1, curPos + offset + 1) };
  }

  updatePos(offset) { this.payload.curPos += offset; }

  stepBack(offset) { this.payload.curPos -= offset; }

  failCleanup() { this.payload.output = []; }

  _(test, sigil, successFunc, failFunc) {
    if (sigil == null) return this.one(test, successFunc, failFunc);
    else if (sigil === '+') return this.more(test, successFunc, failFunc);
    else if (sigil === '?') return this.opt(test, successFunc);
    else if (sigil === '*') return this.optmore(test, successFunc);
    throw Error('ParseError: incorrect sigil passed to \'_\' function');
  }

  // If `a` is a string, it checks if appears `a` in `code` after the current position
  // and consumes it. `a` must appear after current position.
  one(test, successFunc, failFunc) {
    if (this.payload.done || this.payload.failed) return this;
    const offset = test.length;
    let token = null;
    this.payload.tokens = null;
    this.payload.curRule = test;

    const peek = this.peek(offset);
    if (peek.success && peek.value === test) {
      token = peek.value;
      this.payload.tokens = token;
      this.updatePos(offset);
      if (this.payload.curPos === this.payload.code.length - 1) this.payload.exhausted = true;
      const output = this.funcCheck(successFunc, this.payload.successFunc, token);
      if (output) this.payload.output.push(output);
      return this;
    }

    this.payload.failed = true;
    const output = this.funcCheck(failFunc, this.payload.failFunc, token);
    if (output) this.payload.output.push(output);
    this.failCleanup();
    return this;
  }

  // If `a` is a string, it checks if a sequence `a` appears in `code` after the current position
  // and consumes it. `a` must appear at least once to pass
  more(test, successFunc, failFunc) {
    if (this.payload.done || this.payload.failed) return this;
    const offset = test.length;
    const tokens = [];
    this.payload.tokens = null;
    let count = 0;
    this.payload.curRule = `${test}+`;

    let peek = this.peek(offset);
    while (peek.success && peek.value === test) {
      tokens.push(peek.value);
      this.updatePos(offset);
      if (this.payload.curPos === this.payload.code.length - 1) this.payload.exhausted = true;
      count += 1;
      peek = this.peek(offset);
    }

    if (count > 0) {
      this.payload.tokens = tokens;
      const output = this.funcCheck(successFunc, this.payload.successFunc, tokens);
      if (output) this.payload.output.push(output);
      return this;
    }

    this.payload.failed = true;
    const output = this.funcCheck(failFunc, this.payload.failFunc, tokens);
    if (output) this.payload.output.push(output);
    this.failCleanup();
    return this;
  }

  // If `a` is a string, it checks if `a` appears in `code` after the current position
  // and consumes it. It passes irrespective of `a` appearing
  opt(test, func) {
    if (this.payload.done || this.payload.failed) return this;
    const offset = test.length;
    let token = null;
    this.payload.tokens = null;
    this.payload.curRule = `${test}?`;

    const peek = this.peek(offset);
    if (peek.success && peek.value === test) {
      token = peek.value;
      this.updatePos(offset);
    }

    if (this.payload.curPos === this.payload.code.length - 1) this.payload.exhausted = true;

    this.payload.tokens = token;
    const output = this.funcCheck(func, this.payload.successFunc, token);
    if (output) this.payload.output.append(output);
    return this;
  }

  // If `a` is a string, it checks if a sequence `a` appears in `code` after the current position
  // and consumes it. It passes irrespective of `a` appearing
  optmore(test, func) {
    if (this.payload.done || this.payload.failed) return this;
    const offset = test.length;
    const tokens = [];
    this.payload.tokens = null;
    this.payload.curRule = `${test}*`;
    print(this.payload);
    if (test instanceof Function) {
      let oldPos = this.payload.curPos;
      let { payload } = test(this);
      while (payload.curPos > oldPos) {
        tokens.push(payload.tokens);
        oldPos = payload.curPos;
        // eslint-disable-next-line prefer-destructuring
        payload = test(this).payload;
      }
    } else if (typeof (test) === 'string') {
      let peek = this.peek(offset);
      while (peek.success && peek.value === test) {
        tokens.push(peek.value);
        this.updatePos(offset);
        peek = this.peek(offset);
      }
    } else throw Error('ParseError: expected first argument,`test`, to be string or Function');

    if (this.payload.curPos === this.payload.code.length - 1) this.payload.exhausted = true;


    this.payload.tokens = tokens;
    const output = this.funcCheck(func, this.payload.successFunc, tokens);
    if (output) this.payload.output.append(output);
    return this;
  }

  eoi(successFunc, failFunc) {
    if (this.payload.done || this.payload.failed) return this;
    this.payload.curRule = 'eoi';

    if (this.payload.curPos + 1 >= this.payload.code.length) {
      this.payload.exhausted = true;
      const output = this.funcCheck(successFunc, this.payload.successFunc);
      if (output) this.payload.output.append(output);
      return this;
    }

    this.payload.failed = true;
    const output = this.funcCheck(failFunc, this.payload.failFunc);
    if (output) this.payload.output.append(output);
    this.failCleanup();
    return this;
  }

  exec(func) {
    const output = this.funcCheck(func);
    if (output) this.payload.output.append(output);
  }

  or() {
    if (this.payload.failed || !this.payload.exhausted) {
      this.payload.failed = false;
      this.payload.exhausted = false;
      this.payload.curPos = this.payload.startPos - 1;
      return this;
    } else if (!this.payload.failed && this.payload.exhausted) {
      this.payload.done = true;
      return this;
    }
    return this;
  }

  sub(rule) {
    if (this.payload.done || this.payload.failed) return this;
    const originalStartPos = this.payload.startPos;
    this.payload.startPos = this.payload.curPos;

    const result = rule(this);
    result.payload.startPos = originalStartPos;
    return result;
  }

  not(rule, successFunc, failFunc) {
    if (this.payload.done || this.payload.failed) return this;
    const originalExhausted = this.payload.exhausted;
    const originalStartPos = this.payload.startPos;
    const originalCurPos = this.payload.curPos;
    const originalSuccessFunc = this.payload.successFunc;
    const originalFailFunc = this.payload.failFunc;
    this.payload.startPos = this.payload.curPos;
    this.payload.successFunc = null;
    this.payload.failFunc = null;

    const result = rule(this);
    result.payload.done = false;
    result.payload.failed = !result.payload.failed;
    result.payload.exhausted = originalExhausted;
    result.payload.startPos = originalStartPos;
    result.payload.curPos = originalCurPos;
    result.payload.successFunc = originalSuccessFunc;
    result.payload.failFunc = originalFailFunc;

    if (!result.payload.failed) {
      const output = this.funcCheck(successFunc, this.payload.successFunc, null);
      if (output) this.payload.output.push(output);
    } else {
      const output = this.funcCheck(failFunc, this.payload.failFunc, null);
      if (output) this.payload.output.push(output);
      this.failCleanup();
    }

    return result;
  }

  and(rule, successFunc, failFunc) {
    if (this.payload.done || this.payload.failed) return this;
    const originalExhausted = this.payload.exhausted;
    const originalStartPos = this.payload.startPos;
    const originalCurPos = this.payload.curPos;
    const originalSuccessFunc = this.payload.successFunc;
    const originalFailFunc = this.payload.failFunc;
    this.payload.startPos = this.payload.curPos;
    this.payload.successFunc = null;
    this.payload.failFunc = null;

    const result = rule(this);
    result.payload.done = false;
    result.payload.exhausted = originalExhausted;
    result.payload.startPos = originalStartPos;
    result.payload.curPos = originalCurPos;
    result.payload.successFunc = originalSuccessFunc;
    result.payload.failFunc = originalFailFunc;

    if (!result.payload.failed) {
      const output = this.funcCheck(successFunc, this.payload.successFunc, null);
      if (output) this.payload.output.push(output);
    } else {
      const output = this.funcCheck(failFunc, this.payload.failFunc, null);
      if (output) this.payload.output.push(output);
      this.failCleanup();
    }
    return result;
  }

  cond(func, successFunc, failFunc) {
    if (this.payload.done || this.payload.failed) return this;
    if (func && func instanceof Function) {
      const result = func();
      if (result) {
        const output = this.funcCheck(successFunc, this.payload.successFunc, null);
        if (output) this.payload.output.push(output);
      } else {
        this.payload.failed = true;
        const output = this.funcCheck(failFunc, this.payload.failFunc, null);
        if (output) this.payload.output.push(output);
        this.failCleanup();
      }
      return this;
    }
    throw Error('ParseError: expect a function that returns a boolean');
  }

  funcCheck(func, fallbackFunc, token) {
    if (func instanceof Function) {
      return func(this.payload, token);
    } else if (fallbackFunc instanceof Function) {
      return fallbackFunc(this.payload, token);
    } return null;
  }
}

const use = (code, successFunc, failFunc, load) => {
  const payload = {
    code,
    successFunc,
    failFunc,
    curPos: load ? load.curPos : -1,
    startPos: load ? load.startPos : 0,
    failed: false,
    done: false,
    exhausted: false,
    tokens: [],
    curRule: '',
    output: load ? load.output : [],
  };
  return new Parser(payload);
};

const _ = (test, sigil, successFunc, failFunc) => s => s._(test, sigil, successFunc, failFunc);

/* eslint-disable newline-per-chained-call */
const pushOutput = (payload, token) => {
  if (token) payload.output.push(token);
};
const printOutput = (payload) => { print(payload.output); };

const result =
    use('abbb', pushOutput, printOutput)
      .one('ab').sub(p => p.one('a').and(_('b'))).one('c').or().one('ab').optmore(_('b')).or()._('a').optmore(_('b'));
print(result);

// result =
//   use('ab', pushOutput, printOutput)
//     .one('a').one('b').optmore('a').or().one('a').one('b');
// print(result);

// result =
//   use('abbbb', pushOutput)
//     .one('a').one('bb').one('bb');
// print(result);

module.exports = { Parser, use, _ };

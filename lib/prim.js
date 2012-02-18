/*!
 * Prim: a practical JSON implementation
 * http://github.com/kitcambridge/prim
 *
 * Copyright 2012, Kit Cambridge.
 *
 * Released under the MIT License.
*/

(function () {
  "use strict";

  // Convenience aliases.
  var Prim = this, getClass = {}.toString, isPropertyOf = {}.hasOwnProperty,

  // Maps escaped JSON control characters to their revived equivalents.
  Unescapes = Prim.Unescapes = {
    "\\": "\\",
    '"': '"',
    "/": "/",
    "b": "\b",
    "t": "\t",
    "n": "\n",
    "f": "\f",
    "r": "\r"
  },

  // Maps control characters to their escaped equivalents.
  Escapes = Prim.Escapes = {
    "\\": "\\\\",
    '"': '\\"',
    "\b": "\\b",
    "\f": "\\f",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t"
  };

  // The current version of Prim.
  Prim.version = "0.2.0";

  // Parses a JSON source string.
  Prim.parse = function (source, callback) {
    var parser = new Parser(source), value = parser.parse(parser.get());
    // If a JSON string contains multiple tokens, it is invalid.
    if (parser.get() != "$") {
      throw SyntaxError("Expected end-of-file.");
    }
    return typeof callback == "function" ? Prim.walk({ "": value }, "", callback) : value;
  };

  // Recursively traverses a parsed JSON object, invoking the callback function
  // for each value. This is an implementation of the `Walk(holder, name)`
  // operation defined in ES 5.1 section 15.12.2.
  Prim.walk = function (source, property, callback) {
    var value = source[property], length, element, property;
    if (Object(value) === value) {
      if (getClass.call(value) == "[object Array]") {
        for (length = value.length; length--;) {
          element = Prim.walk(value, length, callback);
          if (typeof element == "undefined") {
            value.splice(length, 1);
          } else {
            value[length] = element;
          }
        }
      } else {
        for (property in value) {
          if (!isPropertyOf.call(value, property)) {
            continue;
          }
          element = Prim.walk(value, property, callback);
          if (typeof element == "undefined") {
            delete value[property];
          } else {
            value[property] = element
          }
        }
      }
    }
    return callback.call(source, property, value);
  };

  // Internal: creates a new JSON parser instance. The `source` string is parsed
  // according to the grammar specified in section 15.12.1 of the ES 5.1 spec.
  Prim.Parser = Parser;
  function Parser(source) {
    this.source = source;
    this.index = 0;
  }

  // Returns the next token, or `"$"` if the parser has reached the end of the
  // source string. A token may be a string, number, `null` literal, or Boolean
  // literal.
  Parser.prototype.get = function () {
    for (var source = this.source, length = this.source.length, symbol, value, begin, position, sign; this.index < length;) {
      symbol = source.charAt(this.index);
      switch (symbol) {
        // Skip whitespace tokens, including tabs, carriage returns, line
        // feeds, and space characters.
        case "\t":
        case "\r":
        case "\n":
        case " ":
          this.index += 1;
          break;
        // Parse a punctuator token at the current position.
        case "{":
        case "}":
        case "[":
        case "]":
        case ":":
        case ",":
          this.index += 1;
          return symbol;
        // Parse a JSON string token at the current position. String tokens are
        // prefixed with the special `@` character to distinguish them from
        // punctuators.
        case '"':
          value = "@";
          // Advance to the first character.
          this.index += 1;
          while (this.index < length) {
            symbol = source.charAt(this.index);
            if (symbol < " ") {
              // Unescaped ASCII control characters are not permitted.
              throw SyntaxError("Unescaped control character in string.");
            } else if (symbol == "\\") {
              // Parse escaped JSON control characters, `"`, `\`, `/`, and
              // Unicode escape sequences.
              this.index += 1;
              symbol = source.charAt(this.index);
              if ('\\"/btnfr'.indexOf(symbol) > -1) {
                // Revive escaped control characters.
                value += Unescapes[symbol];
                this.index += 1;
              } else if (symbol == "u") {
                // Advance to the first character of the escape sequence.
                begin = this.index += 1;
                // Validate the Unicode escape sequence.
                for (position = this.index + 4; this.index < position; this.index += 1) {
                  symbol = source.charAt(this.index);
                  // A valid sequence comprises four hexdigits that form a
                  // single hexadecimal value.
                  if (!(symbol >= "0" && symbol <= "9" || symbol >= "a" && symbol <= "f" || symbol >= "A" && symbol <= "F")) {
                    throw SyntaxError("Invalid Unicode escape sequence in string.");
                  }
                }
                // Revive the escaped character.
                value += String.fromCharCode(parseInt(source.slice(begin, this.index), 16));
              } else {
                throw SyntaxError("Invalid escape sequence in string.");
              }
            } else {
              if (symbol == '"') {
                // An unescaped double-quote character marks the end of the
                // string.
                break;
              }
              // Append the original character as-is.
              value += symbol;
              this.index += 1;
            }
          }
          if (source.charAt(this.index) == '"') {
            this.index += 1;
            // Return the revived string.
            return value;
          }
          throw SyntaxError("Unterminated string.");
        // Parse numbers and literals.
        default:
          begin = this.index;
          // Advance the scanner's position past the sign, if one is specified.
          if (symbol == "-") {
            sign = true;
            symbol = source.charAt(this.index += 1);
          }
          // Parse an integer or floating-point value.
          if (symbol >= "0" && symbol <= "9") {
            // Leading zeroes are interpreted as octal literals.
            if (symbol == "0" && (symbol = source.charAt(this.index + 1), symbol >= "0" && symbol <= "9")) {
              throw SyntaxError("Illegal octal literal.");
            }
            sign = false;
            // Parse the integer component.
            for (; this.index < length && (symbol = source.charAt(this.index), symbol >= "0" && symbol <= "9"); this.index += 1);
            // Floats cannot contain a leading decimal point; however, this
            // case is already accounted for by the parser.
            if (source.charAt(this.index) == ".") {
              position = this.index += 1;
              // Parse the decimal component.
              for (; position < length && (symbol = source.charAt(position), symbol >= "0" && symbol <= "9"); position += 1);
              if (position == this.index) {
                throw SyntaxError("Illegal trailing decimal.");
              }
              this.index = position;
            }
            // Parse exponents.
            symbol = source.charAt(this.index);
            if (symbol == "e" || symbol == "E") {
              // Skip past the sign following the exponent, if one is specified.
              symbol = source.charAt(this.index += 1);
              if (symbol == "+" || symbol == "-") {
                this.index += 1;
              }
              // Parse the exponential component.
              for (position = this.index; position < length && (symbol = source.charAt(position), symbol >= "0" && symbol <= "9"); position += 1);
              if (position == this.index) {
                throw SyntaxError("Illegal empty exponent.");
              }
              this.index = position;
            }
            // Coerce the parsed value to a JavaScript number.
            return +source.slice(begin, this.index);
          }
          // A negative sign may only precede numbers.
          if (sign) {
            throw SyntaxError("Unexpected `-`.");
          }
          // `true`, `false`, and `null` literals.
          if (symbol == "t" && source.slice(this.index, this.index + 4) == "true") {
            this.index += 4;
            return true;
          } else if (symbol == "f" && source.slice(this.index, this.index + 5) == "false") {
            this.index += 5;
            return false;
          } else if (symbol == "n" && source.slice(this.index, this.index + 4) == "null") {
            this.index += 4;
            return null;
          }
          throw SyntaxError("Unrecognized token.");
      }
    }
    // Return the sentinel `$` character if the parser has reached the end of
    // the source string.
    return "$";
  }

  // Parses a JSON token.
  Parser.prototype.parse = function (value) {
    var results, any, key;
    if (value == "$") {
      throw SyntaxError("Unexpected end-of-file.");
    }
    if (typeof value == "string") {
      if (value.charAt(0) == "@") {
        // Remove the sentinel `@` character.
        return value.slice(1);
      }
      // Parse object and array literals.
      switch (value) {
        // Parses a JSON array, returning a new JavaScript array.
        case "[":
          results = [];
          for (;; any || (any = true)) {
            value = this.get();
            // A closing square bracket marks the end of the array literal.
            if (value == "]") {
              break;
            }
            // If the array literal contains elements, the current token should
            // be a comma separating the previous element from the next.
            if (any) {
              if (value == ",") {
                value = this.get();
                if (value == "]") {
                  throw SyntaxError("Unexpected trailing `,` in array literal.");
                }
              } else {
                throw SyntaxError("A comma (`,`) must separate the previous array element from the next.");
              }
            }
            // Elisions and leading commas are not permitted.
            if (value == ",") {
              throw SyntaxError("Unexpected `,` in array literal.");
            }
            results.push(this.parse(value));
          }
          return results;
        // Parses a JSON object, returning a new JavaScript object.
        case "{":
          results = {};
          for (;; any || (any = true)) {
            value = this.get();
            // A closing curly brace marks the end of the object literal.
            if (value == "}") {
              break;
            }
            // If the object literal contains members, the current token should
            // be a comma separating the previous member from the next.
            if (any) {
              if (value == ",") {
                value = this.get();
                if (value == "}") {
                  throw SyntaxError("Unexpected trailing `,`. in object literal.");
                }
              } else {
                throw SyntaxError("A comma (`,`) must separate the previous object member from the next.");
              }
            }
            // Leading commas are not permitted.
            if (value == ",") {
              throw SyntaxError("Unexpected `,` in object literal.");
            }
            if (typeof value != "string" || value.charAt(0) != "@") {
              throw SyntaxError("Object property names must be double-quoted strings.");
            }
            if (this.get() != ":") {
              throw SyntaxError("A single colon (`:`) must separate each object property name from the value.");
            }
            results[value.slice(1)] = this.parse(this.get());
          }
          return results;
      }
      throw SyntaxError("Expected `[` or `{`.");
    }
    return value;
  };

  // Converts `value` into a zero-padded string such that its length is at
  // least equal to `width`. The `width` must be <= 6.
  function toPaddedString(width, value) {
    value = String(value);
    return ("000000" + value).slice(-width);
  }

  // Double-quotes a string, replacing all ASCII control characters with their
  // escaped equivalents. This is an implementation of the `Quote(value)`
  // operation defined in ES 5.1 section 15.12.3.
  function quote(value) {
    var result = '"', index = 0, symbol;
    for (; symbol = value.charAt(index); index += 1) {
      // Escape the reverse solidus, double quote, backspace, form feed, line
      // feed, carriage return, and tab characters.
      result += '\\"\b\f\n\r\t'.indexOf(symbol) > -1 ? Escapes[symbol] :
        // If the character is a control character, append its Unicode escape
        // sequence; otherwise, append the character as-is.
        symbol < " " ? "\\u" + toPaddedString(4, symbol.charCodeAt(0).toString(16)) : symbol;
    }
    return result + '"';
  }

  // Recursively serializes an object. Implements the `Str(key, holder)`,
  // `JO(value)`, and `JA(value)` operations.
  function serialize(property, object, callback, properties, whitespace, indentation, stack) {
    var value = object[property], className, year, results, element, index, length, prefix, any;
    if (Object(value) === value) {
      if (typeof value.toJSON == "function") {
        value = value.toJSON(property);
      } else if (getClass.call(value) == "[object Date]") {
        // Dates are serialized according to the `Date.toJSON` method specified
        // in ES 5.1 section 15.9.5.44. See section 15.9.1.15 for the ISO 8601
        // date time string format.
        year = value.getUTCFullYear();
        // Serialize extended years correctly.
        return "\"" + (year <= 0 || year >= 1e4 ? (year < 0 ? "-" : "+") + toPaddedString(6, Math.abs(year)) : toPaddedString(4, year)) +
          "-" + toPaddedString(2, value.getUTCMonth() + 1) + "-" + toPaddedString(2, value.getUTCDate()) +
          // Months, dates, hours, minutes, and seconds should have two digits; milliseconds should have three.
          "T" + toPaddedString(2, value.getUTCHours()) + ":" + toPaddedString(2, value.getUTCMinutes()) + ":" + toPaddedString(2, value.getUTCSeconds()) +
          // Milliseconds are optional in ES 5.0, but required in 5.1.
          "." + toPaddedString(3, value.getUTCMilliseconds()) + "Z\"";
      }
    }
    if (callback) {
      // If a replacement function was provided, call it to obtain the value
      // for serialization.
      value = callback.call(object, property, value);
    }
    if (value === null) {
      return "null";
    }
    className = getClass.call(value);
    switch (className) {
      case "[object Boolean]":
        // Booleans are represented literally.
        return String(value);
      case "[object Number]":
        // JSON numbers must be finite. `Infinity` and `NaN` are serialized as
        // `"null"`.
        return isFinite(value) ? String(value) : "null";
      case "[object String]":
        // Strings are double-quoted and escaped.
        return quote(value);
    }
    // Recursively serialize objects and arrays.
    if (typeof value == "object") {
      // Check for cyclic structures.
      for (length = stack.length; length--;) {
        if (stack[length] == value) {
          throw TypeError("Cyclic structures cannot be serialized.");
        }
      }
      // Add the object to the stack of traversed objects.
      stack.push(value);
      results = [];
      // Save the current indentation level and indent one additional level.
      prefix = indentation;
      indentation += whitespace;
      if (className == "[object Array]") {
        // Recursively serialize array elements.
        for (index = 0, length = value.length; index < length; any || (any = true), index++) {
          element = serialize(index, value, callback, properties, whitespace, indentation, stack);
          results.push(typeof element == "undefined" ? "null" : element);
        }
        if (any) {
          return whitespace ? "[\n" + indentation + results.join(",\n" + indentation) + "\n" + prefix + "]" : ("[" + results.join(",") + "]");
        }
        return "[]";
      } else {
        // Recursively serialize object members.
        for (property in value) {
          if (properties) {
            // If a list of object properties for serialization was provided,
            // ensure that the current property is included in it.
            if (!isPropertyOf.call(properties, property)) {
              continue;
            }
          } else if (!isPropertyOf.call(value, property)) {
            // Ignore inherited properties.
            continue;
          }
          element = serialize(property, value, callback, properties, whitespace, indentation, stack);
          if (typeof element != "undefined") {
            // According to ES 5.1 section 15.12.3, p. 207: "If `gap`
            // {`whitespace`} is not the empty string, let `member`
            // {`quote(property) + ":"`} be the concatenation of `member` and
            // the `space` character." The "`space` character" refers to the
            // literal space character, not the `space` argument provided to
            // `JSON.stringify()` (i.e., `space` should not be enclosed in
            // backticks).
            results.push(quote(property) + ":" + (whitespace ? " " : "") + element);
          }
          any || (any = true);
        }
        if (any) {
          return whitespace ? "{\n" + indentation + results.join(",\n" + indentation) + "\n" + prefix + "}" : ("{" + results.join(",") + "}");
        }
        return "{}";
      }
      // Remove the object from the traversed object stack.
      stack.pop();
    }
  }

  // Serializes a JavaScript `value` as a JSON string. The optional `filter`
  // argument may be either a function that alters how certain values in objects
  // and arrays are serialized, or an array of strings and numbers that filters
  // object properties for serialization. The optional `width` argument may be
  // either a string or number that specifies the indentation level of the
  // output.
  Prim.stringify = function (value, filter, width) {
    var callback, properties, length, element, whitespace;
    if (Object(filter) === filter) {
      if (typeof filter == "function") {
        callback = filter;
      } else if (getClass.call(filter) == "[object Array]") {
        // Convert the property names array into a makeshift set.
        properties = {};
        for (length = filter.length; length--;) {
          element = filter[length];
          if (element && (getClass.call(element) == "[object String]" || getClass.call(element) == "[object Number]")) {
            properties[element] = 1;
          }
        }
      }
    }
    if (width != null && width !== "") {
      if (getClass.call(width) == "[object Number]") {
        // Convert the `width` to an integer and create a string containing
        // `width` number of space characters.
        if ((width -= width % 1) > 0) {
          whitespace = Array((width <= 10 ? width : 10) + 1).join(" ");
        }
      } else if (getClass.call(width) == "[object String]") {
        whitespace = width.length <= 10 ? width : width.slice(0, 10);
      }
    }
    return serialize("", { "": value }, callback, properties, whitespace || "", "", []);
  }
}).call(typeof exports == "object" && exports || (this.Prim = {}));
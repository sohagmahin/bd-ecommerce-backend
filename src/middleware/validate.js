const { validationResult } = require('express-validator');
const { error } = require('../utils/response');

/**
 * Run after express-validator chains. Returns 422 with field errors if validation fails.
 */
const validate = (req, res, next) => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const errors = result.array().map((e) => ({ field: e.path, message: e.msg }));
    return error(res, 'Validation failed', 422, errors);
  }
  next();
};

module.exports = validate;

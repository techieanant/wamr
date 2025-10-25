import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError, ZodEffects } from 'zod';
import { ErrorCodes, HttpStatus } from '../../utils/error-codes';
import { logger } from '../../config/logger';

/**
 * Validation target (body, query, params)
 */
type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Accepted schema types
 */
type ZodSchema = AnyZodObject | ZodEffects<any>;

/**
 * Create validation middleware using Zod schema
 * @param schema - Zod schema to validate against
 * @param target - Target to validate (body, query, params)
 * @returns Express middleware
 */
export function validate(schema: ZodSchema, target: ValidationTarget = 'body') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get data to validate
      const data = req[target];

      // Validate data against schema
      const validated = await schema.parseAsync(data);

      // Replace request data with validated data
      req[target] = validated;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod validation errors
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        logger.warn({ errors, target }, 'Validation failed');

        res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
          error: 'Validation failed',
          code: ErrorCodes.VALIDATION_ERROR,
          details: errors,
        });
        return;
      }

      // Unexpected error
      logger.error({ error }, 'Validation middleware error');
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Validation error',
        code: ErrorCodes.INTERNAL_SERVER_ERROR,
      });
    }
  };
}

/**
 * Validate multiple targets (body + query, for example)
 * @param schemas - Object with schemas for each target
 * @returns Express middleware
 */
export function validateMultiple(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors: Array<{ field: string; message: string }> = [];

      // Validate body
      if (schemas.body) {
        try {
          req.body = await schemas.body.parseAsync(req.body);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push(
              ...error.errors.map((err) => ({
                field: `body.${err.path.join('.')}`,
                message: err.message,
              }))
            );
          }
        }
      }

      // Validate query
      if (schemas.query) {
        try {
          req.query = await schemas.query.parseAsync(req.query);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push(
              ...error.errors.map((err) => ({
                field: `query.${err.path.join('.')}`,
                message: err.message,
              }))
            );
          }
        }
      }

      // Validate params
      if (schemas.params) {
        try {
          req.params = await schemas.params.parseAsync(req.params);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push(
              ...error.errors.map((err) => ({
                field: `params.${err.path.join('.')}`,
                message: err.message,
              }))
            );
          }
        }
      }

      // If any validation failed, return errors
      if (errors.length > 0) {
        logger.warn({ errors }, 'Multi-target validation failed');
        res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
          error: 'Validation failed',
          code: ErrorCodes.VALIDATION_ERROR,
          details: errors,
        });
        return;
      }

      next();
    } catch (error) {
      logger.error({ error }, 'Multi-target validation middleware error');
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Validation error',
        code: ErrorCodes.INTERNAL_SERVER_ERROR,
      });
    }
  };
}

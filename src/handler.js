/* @flow */
/**
 *  Fork Copyright (c) 2016, Martin Heidegger,
 *
 *  Original Copyright (c) 2015, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 */

import type { Response } from 'express';
import { formatError, execute } from 'graphql';
import type { GraphQLSchema, DocumentNode } from 'graphql';
import type { Request, GraphQLParams, RequestInfo } from './index';
import accepts from 'accepts';

export class GraphQLRawError {
  status: number
  errors: [any]
  constructor(status: number, errors: [any]) {
    this.status = status;
    this.errors = errors;
  }
}


/**
 * Helper function to determine if GraphiQL can be displayed.
 */
export function canDisplayGraphiQL(
  request: Request,
  params: GraphQLParams
): boolean {
  // If `raw` exists, GraphiQL mode is not enabled.
  // Allowed to show GraphiQL if not requested as raw and this request
  // prefers HTML over JSON.
  return !params.raw && accepts(request).types([ 'json', 'html' ]) === 'html';
}


export function handleResult(formatErrorFn: ?(any) => mixed,
                             response: Response, result: any) {
  // If no data was included in the result, that indicates a runtime query
  // error, indicate as such with a generic status code.
  // Note: Information about the error itself will still be contained in
  // the resulting JSON payload.
  // http://facebook.github.io/graphql/#sec-Data
  if (result && result.data === null) {
    response.statusCode = 500;
  }
  // Format any encountered errors.
  if (result && result.errors) {
    (result: any).errors = result.errors.map(formatErrorFn || formatError);
  }

  return result;
}

export function handleError(response: Response, error: any) {
  // If an error was caught, report the httpError status, or 500.
  response.statusCode = error.status || 500;

  if (error instanceof GraphQLRawError) {
    return { errors: error.errors };
  }
  return { errors: [ error ] };
}

export function graphqlError(status: number, errors: string[]) {
  return new GraphQLRawError(status, errors);
}

export function exec(
  schema: GraphQLSchema,
  rootValue: ?mixed,
  context: any,
  extensionsInput: ?(info: RequestInfo) => {[key: string]: mixed},
  documentAST: DocumentNode,
  variables: ?{[name: string]: mixed},
  operationName: ?string
): any {
  let executor;
  try {
    executor = execute(
      schema,
      documentAST,
      rootValue,
      context,
      variables,
      operationName
    );
  } catch (contextError) {
    return Promise.reject(graphqlError(400, [ contextError ]));
  }
  if (typeof extensionsInput === 'function') {
    const extensionsFn = extensionsInput;
    executor.then(result => Promise.resolve(extensionsFn({
      document: documentAST,
      variables,
      operationName,
      result
    })).then(extensions => {
      result.extensions = extensions;
      return result;
    }));
  }
  return executor;
}

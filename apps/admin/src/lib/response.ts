import { NextResponse } from "next/server";

export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: {
    status?: "no_data";
    [key: string]: unknown;
  };
};

export type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function successResponse<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>({ success: true, data }, init);
}

export function noDataResponse<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>(
    {
      success: true,
      data,
      meta: {
        status: "no_data",
      },
    },
    init,
  );
}

export function errorResponse(
  code: string,
  message: string,
  status = 500,
  details?: unknown,
) {
  return NextResponse.json<ApiFailure>(
    {
      success: false,
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    },
    { status },
  );
}


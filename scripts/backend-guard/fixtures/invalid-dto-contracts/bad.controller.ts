import { Body, Controller } from "@nestjs/common";

@Controller("api/bad")
export class BadController {
  create(@Body() body: Record<string, unknown>) {
    return body;
  }

  update(
    @Body()
    body: {
      readonly name?: string;
    },
  ) {
    return body;
  }

  patch(
    @Body()
    payload: {
      readonly displayName?: string;
    },
  ) {
    return payload;
  }
}

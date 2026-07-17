import { IsNotEmpty, IsString } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  actual: string;

  @IsString()
  @IsNotEmpty()
  nueva: string;
}

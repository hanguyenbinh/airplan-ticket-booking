import { IsNotEmpty, IsNumber, IsPositive, IsString, IsUUID, Length } from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  flightId: string;

  @IsString()
  @Length(3, 10)
  seatNo: string;

  @IsString()
  @IsNotEmpty()
  passengerName: string;

  @IsNumber()
  @IsPositive()
  totalAmount: number;
}

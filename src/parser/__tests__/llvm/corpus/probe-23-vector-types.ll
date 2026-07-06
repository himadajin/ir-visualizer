define <4 x i32> @f(<4 x i32> %a, <4 x i32> %b) {
  %c = add <4 x i32> %a, %b
  ret <4 x i32> %c
}

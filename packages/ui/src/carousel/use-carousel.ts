import { useRef, useState } from 'react'
import { scrolledSlide, shownSlide } from './carousel-steps'

/**
 * A track of `count` slides that snaps slide by slide: the slide in view, a press of an arrow, and the track's handlers
 * that follow a swipe.
 */
export const useCarousel = (count: number) => {
  const track = useRef<HTMLSpanElement>(null)
  // The slide the arrows last moved to, while the track is still on its way there
  const aim = useRef<number>(undefined)
  const [index, setIndex] = useState(0)
  const show = (position: number) => {
    const scroller = track.current
    if (scroller) scroller.scrollTo({ left: position * scroller.clientWidth })
  }
  const press = (by: number) => {
    aim.current = shownSlide((aim.current ?? index) + by, count)
    show(aim.current)
  }
  const touch = () => {
    aim.current = undefined
  }
  const scrolled = (scroller: HTMLElement) => {
    setIndex(scrolledSlide(scroller.scrollLeft, scroller.clientWidth, count))
    if (aim.current !== undefined && Math.abs(scroller.scrollLeft - aim.current * scroller.clientWidth) < 1) aim.current = undefined
  }
  return { track, index, press, touch, scrolled }
}

export type CarouselState = ReturnType<typeof useCarousel>
